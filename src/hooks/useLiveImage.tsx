import { LiveImageShape } from '@/components/LiveImageShapeUtil'
import { blobToDataUri } from '@/utils/blob'
import { debounce } from '@/utils/debounce'
import * as fal from '@fal-ai/serverless-client'
import {
	AssetRecordType,
	Editor,
	TLShape,
	TLShapeId,
	getHashForObject,
	getSvgAsImage,
	rng,
	useEditor,
} from '@tldraw/tldraw'
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { v4 as uuid } from 'uuid'

type LiveImageResult = { url: string }
type LiveImageRequest = {
	prompt: string
	image_url: string
	sync_mode: boolean
	strength: number
	seed: number
	enable_safety_checks: boolean
}

export interface LiveImageContextType {
	backend: 'fal' | 'pollinations' | 'puter'
	setBackend: (backend: 'fal' | 'pollinations' | 'puter') => void
	status: 'connected' | 'disconnected' | 'error' | 'generating' | 'idle'
	error: string | null
	fetchImage: (req: LiveImageRequest) => Promise<LiveImageResult>
}

const LiveImageContext = createContext<LiveImageContextType | null>(null)

export function LiveImageProvider({
	children,
	appId,
	throttleTime = 0,
	timeoutTime = 8000,
}: {
	children: React.ReactNode
	appId: string
	throttleTime?: number
	timeoutTime?: number
}) {
	const [backend, setBackendState] = useState<'fal' | 'pollinations' | 'puter'>(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('draw-fast-backend')
			if (saved === 'fal' || saved === 'pollinations' || saved === 'puter') {
				return saved
			}
		}
		return 'pollinations'
	})

	const setBackend = (newBackend: 'fal' | 'pollinations' | 'puter') => {
		setBackendState(newBackend)
		if (typeof window !== 'undefined') {
			localStorage.setItem('draw-fast-backend', newBackend)
		}
	}

	const [status, setStatus] = useState<'connected' | 'disconnected' | 'error' | 'generating' | 'idle'>('idle')
	const [error, setError] = useState<string | null>(null)
	const [count, setCount] = useState(0)

	const [falSend, setFalSend] = useState<((req: any) => void) | null>(null)
	const requestsByIdRef = useRef<Map<string, {
		resolve: (result: LiveImageResult) => void
		reject: (err: unknown) => void
		timer: ReturnType<typeof setTimeout>
	}>>(new Map())

	useEffect(() => {
		if (backend !== 'fal') {
			setFalSend(null)
			setStatus('idle')
			setError(null)
			return
		}

		console.log('[LiveImageProvider] Connecting to Fal.ai WebSocket realtime server...')
		setStatus('connected')
		setError(null)

		const requestsById = requestsByIdRef.current
		requestsById.clear()

		try {
			const { send, close } = fal.realtime.connect(appId, {
				connectionKey: 'fal-realtime-example',
				clientOnly: false,
				throttleInterval: throttleTime,
				onError: (err: any) => {
					console.error('[LiveImageProvider] Fal.realtime error:', err)
					setStatus('error')
					setError(err.message || 'Fal WebSocket error')
					// force reconnect
					setCount((c) => c + 1)
				},
				onResult: (result) => {
					setStatus('connected')
					if (result.images && result.images[0]) {
						const id = result.request_id
						const request = requestsById.get(id)
						if (request) {
							request.resolve(result.images[0])
							requestsById.delete(id)
						}
					}
				},
			})

			setFalSend(() => send)

			return () => {
				console.log('[LiveImageProvider] Closing Fal.ai connection...')
				for (const request of requestsById.values()) {
					request.reject(new Error('Connection closed'))
					clearTimeout(request.timer)
				}
				requestsById.clear()
				try {
					close()
				} catch (e) {
					// noop
				}
			}
		} catch (err: any) {
			console.error('[LiveImageProvider] Failed to connect to Fal.ai:', err)
			setStatus('error')
			setError(err.message || 'Failed to connect to Fal.ai')
		}
	}, [backend, appId, count, throttleTime])

	const fetchImage = async (req: LiveImageRequest): Promise<LiveImageResult> => {
		if (backend === 'fal') {
			if (!falSend) {
				throw new Error('Fal real-time connection not active')
			}
			setStatus('generating')
			return new Promise((resolve, reject) => {
				const id = uuid()
				const timer = setTimeout(() => {
					requestsByIdRef.current.delete(id)
					setStatus('error')
					setError('Fal request timed out')
					reject(new Error('Timeout'))
				}, timeoutTime)

				requestsByIdRef.current.set(id, {
					resolve: (res) => {
						setStatus('connected')
						resolve(res)
						clearTimeout(timer)
					},
					reject: (err) => {
						setStatus('error')
						reject(err)
						clearTimeout(timer)
					},
					timer,
				})

				falSend({ ...req, request_id: id })
			})
		} else if (backend === 'pollinations') {
			setStatus('generating')
			setError(null)
			try {
				const response = await fetch('/api/pollinations/proxy', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						prompt: req.prompt,
						image: req.image_url,
						seed: req.seed,
					}),
				})
				if (!response.ok) {
					throw new Error(`Pollinations.ai proxy returned status ${response.status}`)
				}

				const blob = await response.blob()
				const dataUri = await blobToDataUri(blob)
				setStatus('idle')
				return { url: dataUri }
			} catch (err: any) {
				console.error('[LiveImageProvider] Pollinations.ai generation failed:', err)
				setStatus('error')
				if (err.message && err.message.includes('429')) {
					setError('Rate limited (Too Many Requests) by Pollinations.ai. Please wait a moment before drawing again.')
				} else {
					setError(err.message || 'Pollinations.ai failed')
				}
				throw err
			}
		} else {
			// puter backend
			setStatus('generating')
			setError(null)
			if (typeof window !== 'undefined' && (window as any).puter) {
				console.log('[LiveImageProvider] Generating image via Puter.js...');
				const puter = (window as any).puter;
				try {
					const imageElement = await puter.ai.txt2img(req.prompt, {
						model: 'stabilityai/stable-diffusion-xl-base-1.0',
						input_image: req.image_url,
					});
					if (imageElement && imageElement.src) {
						setStatus('idle')
						return { url: imageElement.src };
					}
					throw new Error('Puter.js returned an empty image source');
				} catch (puterError: any) {
					console.error('[LiveImageProvider] Puter.js generation failed:', puterError);
					setStatus('error')
					setError(puterError.message || 'Puter.js generation failed')
					throw puterError;
				}
			} else {
				setStatus('error')
				setError('Puter.js SDK is not loaded')
				throw new Error('Puter.js SDK not found')
			}
		}
	}

	return (
		<LiveImageContext.Provider value={{ backend, setBackend, status, error, fetchImage }}>
			{children}
		</LiveImageContext.Provider>
	)
}

export function useLiveImageContext() {
	const context = useContext(LiveImageContext)
	if (!context) {
		throw new Error('useLiveImageContext must be used within a LiveImageProvider')
	}
	return context
}

export function useLiveImage(
	shapeId: TLShapeId,
	{ throttleTime = 64 }: { throttleTime?: number } = {}
) {
	const editor = useEditor()
	const liveImageCtx = useContext(LiveImageContext)
	if (!liveImageCtx) throw new Error('Missing LiveImageProvider')
	const { fetchImage, backend } = liveImageCtx

	useEffect(() => {
		let prevHash = ''
		let prevPrompt = ''

		let startedIteration = 0
		let finishedIteration = 0

		async function updateDrawing() {
			const shapes = getShapesTouching(shapeId, editor)
			const frame = editor.getShape<LiveImageShape>(shapeId)!

			const hash = getHashForObject([...shapes])
			const frameName = frame.props.name
			if (hash === prevHash && frameName === prevPrompt) return

			startedIteration += 1
			const iteration = startedIteration

			prevHash = hash
			prevPrompt = frame.props.name

			try {
				const svg = await editor.getSvg([...shapes], {
					background: true,
					padding: 0,
					darkMode: editor.user.getIsDarkMode(),
					bounds: editor.getShapePageBounds(shapeId)!,
				})
				// cancel if stale:
				if (iteration <= finishedIteration) return

				if (!svg) {
					console.error('No SVG')
					updateImage(editor, frame.id, '')
					return
				}

				const isFreeEngine = backend === 'pollinations' || backend === 'puter'
				const targetDimension = isFreeEngine ? 128 : 512

				// getSvgAsImage only supports exporting as PNG in Tldraw
				const image = await getSvgAsImage(svg, editor.environment.isSafari, {
					type: 'png',
					quality: 1,
					scale: targetDimension / frame.props.w,
				})
				// cancel if stale:
				if (iteration <= finishedIteration) return

				if (!image) {
					console.error('No image')
					updateImage(editor, frame.id, '')
					return
				}

				const prompt = frameName
					? frameName + ' hd award-winning impressive'
					: 'A random image that is safe for work and not surprising—something boring like a city or shoe watercolor'

				// If it's a free engine, compress the PNG blob to a JPEG data URL to keep the payload size small
				const imageDataUri = isFreeEngine 
					? await compressPngToJpeg(image, 0.5)
					: await blobToDataUri(image)

				// cancel if stale:
				if (iteration <= finishedIteration) return

				const random = rng(shapeId)

				const result = await fetchImage({
					prompt,
					image_url: imageDataUri,
					sync_mode: true,
					strength: 0.65,
					seed: Math.abs(random() * 10000),
					enable_safety_checks: false,
				})
				// cancel if stale:
				if (iteration <= finishedIteration) return

				finishedIteration = iteration
				updateImage(editor, frame.id, result.url)
			} catch (e) {
				const isTimeout = e instanceof Error && e.message === 'Timeout'
				if (!isTimeout) {
					console.error(e)
				}

				// Only auto-retry if this is a temporary connection timeout.
				// NEVER auto-retry on rate limits (429) or other backend failures to prevent spam loops.
				const errorMsg = e instanceof Error ? e.message : ''
				const isRateLimited = errorMsg.includes('429')

				if (iteration === startedIteration && isTimeout && !isRateLimited) {
					requestUpdate()
				}
			}
		}

		let requestUpdate: () => void

		if (backend === 'fal') {
			let timer: ReturnType<typeof setTimeout> | null = null
			requestUpdate = () => {
				if (timer !== null) return
				timer = setTimeout(() => {
					timer = null
					updateDrawing()
				}, throttleTime)
			}
		} else {
			requestUpdate = debounce(() => {
				updateDrawing()
			}, 800)
		}

		editor.on('update-drawings' as any, requestUpdate)
		return () => {
			editor.off('update-drawings' as any, requestUpdate)
		}
	}, [editor, fetchImage, backend, shapeId, throttleTime])
}

function updateImage(editor: Editor, shapeId: TLShapeId, url: string | null) {
	const shape = editor.getShape<LiveImageShape>(shapeId)!
	const id = AssetRecordType.createId(shape.id.split(':')[1])

	const asset = editor.getAsset(id)

	if (!asset) {
		editor.createAssets([
			AssetRecordType.create({
				id,
				type: 'image',
				props: {
					name: shape.props.name,
					w: shape.props.w,
					h: shape.props.h,
					src: url,
					isAnimated: false,
					mimeType: 'image/jpeg',
				},
			}),
		])
	} else {
		editor.updateAssets([
			{
				...asset,
				type: 'image',
				props: {
					...asset.props,
					w: shape.props.w,
					h: shape.props.h,
					src: url,
				},
			},
		])
	}
}

function getShapesTouching(shapeId: TLShapeId, editor: Editor) {
	const shapeIdsOnPage = editor.getCurrentPageShapeIds()
	const shapesTouching: TLShape[] = []
	const targetBounds = editor.getShapePageBounds(shapeId)
	if (!targetBounds) return shapesTouching
	for (const id of [...shapeIdsOnPage]) {
		if (id === shapeId) continue
		const bounds = editor.getShapePageBounds(id)!
		if (bounds.collides(targetBounds)) {
			shapesTouching.push(editor.getShape(id)!)
		}
	}
	return shapesTouching
}

function downloadDataURLAsFile(dataUrl: string, filename: string) {
	const link = document.createElement('a')
	link.href = dataUrl
	link.download = filename
	link.click()
}

function compressPngToJpeg(pngBlob: Blob, quality: number = 0.6): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.width;
				canvas.height = img.height;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Failed to get canvas 2d context'));
					return;
				}
				// Draw white background since JPEG doesn't support transparency
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0);
				const dataUrl = canvas.toDataURL('image/jpeg', quality);
				resolve(dataUrl);
			};
			img.onerror = (e) => reject(e);
			img.src = reader.result as string;
		};
		reader.onerror = (e) => reject(e);
		reader.readAsDataURL(pngBlob);
	});
}
