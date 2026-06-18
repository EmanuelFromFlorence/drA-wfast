import { LiveImageShape, LiveImageShapeUtil } from '@/components/LiveImageShapeUtil'
import { LiveImageTool, MakeLiveButton } from '@/components/LiveImageTool'
import { LockupLink } from '@/components/LockupLink'
import { LiveImageProvider, useLiveImageContext } from '@/hooks/useLiveImage'
import * as fal from '@fal-ai/serverless-client'
import {
	AssetRecordType,
	DefaultSizeStyle,
	Editor,
	TLUiOverrides,
	Tldraw,
	toolbarItem,
	track,
	useEditor,
} from '@tldraw/tldraw'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

fal.config({
	requestMiddleware: fal.withProxy({
		targetUrl: '/api/fal/proxy',
	}),
})

const overrides: TLUiOverrides = {
	tools(editor, tools) {
		tools.liveImage = {
			id: 'live-image',
			icon: 'tool-frame',
			label: 'Frame',
			kbd: 'f',
			readonlyOk: false,
			onSelect: () => {
				editor.setCurrentTool('live-image')
			},
		}
		return tools
	},
	toolbar(_app, toolbar, { tools }) {
		const frameIndex = toolbar.findIndex((item) => item.id === 'frame')
		if (frameIndex !== -1) toolbar.splice(frameIndex, 1)
		const highlighterIndex = toolbar.findIndex((item) => item.id === 'highlight')
		if (highlighterIndex !== -1) {
			const highlighterItem = toolbar[highlighterIndex]
			toolbar.splice(highlighterIndex, 1)
			toolbar.splice(3, 0, highlighterItem)
		}
		toolbar.splice(2, 0, toolbarItem(tools.liveImage))
		return toolbar
	},
}

const shapeUtils = [LiveImageShapeUtil]
const tools = [LiveImageTool]

const SettingsPanel = track(function SettingsPanel() {
	const editor = useEditor()
	const { backend, setBackend, status, error } = useLiveImageContext()
	const isDarkMode = editor.user.getIsDarkMode()
	const [isOpen, setIsOpen] = useState(false)

	return (
		<div className={`live-image-settings-container ${isDarkMode ? 'dark' : ''} ${isOpen ? 'open' : ''}`}>
			{/* Floating Toggle Button */}
			<button
				className="live-image-settings-toggle"
				onClick={() => setIsOpen(!isOpen)}
				title="AI Backend Settings"
				aria-label="Toggle AI Backend Settings"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<line x1="4" y1="21" x2="4" y2="14"></line>
					<line x1="4" y1="10" x2="4" y2="3"></line>
					<line x1="12" y1="21" x2="12" y2="12"></line>
					<line x1="12" y1="8" x2="12" y2="3"></line>
					<line x1="20" y1="21" x2="20" y2="16"></line>
					<line x1="20" y1="12" x2="20" y2="3"></line>
					<line x1="1" y1="14" x2="7" y2="14"></line>
					<line x1="9" y1="8" x2="15" y2="8"></line>
					<line x1="17" y1="16" x2="23" y2="16"></line>
				</svg>
			</button>

			{/* Settings Card */}
			{isOpen && (
				<div className="live-image-settings-card">
					<div className="live-image-settings__title">
						<span>AI Backend Settings</span>
						<button className="live-image-settings__close" onClick={() => setIsOpen(false)}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="18" y1="6" x2="6" y2="18"></line>
								<line x1="6" y1="6" x2="18" y2="18"></line>
							</svg>
						</button>
					</div>
					
					<div className="live-image-settings__subtitle">Active Engine</div>
					<div className="backend-options">
						<div
							className={`backend-option ${backend === 'fal' ? 'active' : ''}`}
							onClick={() => setBackend('fal')}
						>
							<div className="backend-option__info">
								<span className="backend-option__name">Fal.ai</span>
								<span className="backend-option__desc">Real-time WebSocket (Paid)</span>
							</div>
							<div className="backend-option__radio" />
						</div>

						<div
							className={`backend-option ${backend === 'pollinations' ? 'active' : ''}`}
							onClick={() => setBackend('pollinations')}
						>
							<div className="backend-option__info">
								<span className="backend-option__name">Pollinations.ai</span>
								<span className="backend-option__desc">HTTP Generator (Free)</span>
							</div>
							<div className="backend-option__radio" />
						</div>

						<div
							className={`backend-option ${backend === 'puter' ? 'active' : ''}`}
							onClick={() => setBackend('puter')}
						>
							<div className="backend-option__info">
								<span className="backend-option__name">Puter.js</span>
								<span className="backend-option__desc">Client SDK (Free)</span>
							</div>
							<div className="backend-option__radio" />
						</div>
					</div>

					<div className="backend-status">
						<span className={`status-dot ${status}`} />
						<span style={{ textTransform: 'capitalize' }}>
							Status: {status === 'generating' ? 'generating...' : status}
						</span>
					</div>

					{error && (
						<div className="backend-error-message">
							{error}
						</div>
					)}
				</div>
			)}
		</div>
	)
})

export default function App() {
	const onEditorMount = (editor: Editor) => {
		// We need the editor to think that the live image shape is a frame
		// @ts-expect-error: patch
		editor.isShapeOfType = function (arg, type) {
			const shape = typeof arg === 'string' ? this.getShape(arg)! : arg
			if (shape.type === 'live-image' && type === 'frame') {
				return true
			}
			return shape.type === type
		}

		// If there isn't a live image shape, create one
		if (!editor.getCurrentPageShapes().some((shape) => shape.type === 'live-image')) {
			editor.createShape<LiveImageShape>({
				type: 'live-image',
				x: 120,
				y: 180,
				props: {
					w: 512,
					h: 512,
					name: '',
				},
			})
		}

		editor.setStyleForNextShapes(DefaultSizeStyle, 'xl', { ephemeral: true })
	}

	return (
		<LiveImageProvider appId="110602490-lcm-sd15-i2i">
			<main className="tldraw-wrapper">
				<div className="tldraw-wrapper__inner">
					<Tldraw
						persistenceKey="tldraw-fal"
						onMount={onEditorMount}
						shapeUtils={shapeUtils}
						tools={tools}
						shareZone={<MakeLiveButton />}
						overrides={overrides}
					>
						<SneakySideEffects />
						<LockupLink />
						<LiveImageAssets />
						<SettingsPanel />
					</Tldraw>
				</div>
			</main>
		</LiveImageProvider>
	)
}

function SneakySideEffects() {
	const editor = useEditor()

	useEffect(() => {
		editor.sideEffects.registerAfterChangeHandler('shape', () => {
			editor.emit('update-drawings' as any)
		})
		editor.sideEffects.registerAfterCreateHandler('shape', () => {
			editor.emit('update-drawings' as any)
		})
		editor.sideEffects.registerAfterDeleteHandler('shape', () => {
			editor.emit('update-drawings' as any)
		})
	}, [editor])

	return null
}

const LiveImageAssets = track(function LiveImageAssets() {
	const editor = useEditor()

	return (
		<Inject selector=".tl-overlays .tl-html-layer">
			{editor
				.getCurrentPageShapes()
				.filter((shape): shape is LiveImageShape => shape.type === 'live-image')
				.map((shape) => (
					<LiveImageAsset key={shape.id} shape={shape} />
				))}
		</Inject>
	)
})

const LiveImageAsset = track(function LiveImageAsset({ shape }: { shape: LiveImageShape }) {
	const editor = useEditor()

	if (!shape.props.overlayResult) return null

	const transform = editor.getShapePageTransform(shape).toCssString()
	const assetId = AssetRecordType.createId(shape.id.split(':')[1])
	const asset = editor.getAsset(assetId)
	return (
		asset &&
		asset.props.src && (
			<img
				src={asset.props.src!}
				alt={shape.props.name}
				width={shape.props.w}
				height={shape.props.h}
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: shape.props.w,
					height: shape.props.h,
					maxWidth: 'none',
					transform,
					transformOrigin: 'top left',
					opacity: shape.opacity,
				}}
			/>
		)
	)
})

function Inject({ children, selector }: { children: React.ReactNode; selector: string }) {
	const [parent, setParent] = useState<Element | null>(null)
	const target = useMemo(() => parent?.querySelector(selector) ?? null, [parent, selector])

	return (
		<>
			<div ref={(el) => setParent(el?.parentElement ?? null)} style={{ display: 'none' }} />
			{target && createPortal(children, target)}
		</>
	)
}
