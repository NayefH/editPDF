import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { animate, createScope } from 'animejs'

type MotionState = { tool: string; documentKey: string; page: number; dialog: string; notice: string; dragOver: boolean; previewVersion: string }

export function useEditorMotion(root: RefObject<HTMLDivElement | null>, state: MotionState) {
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (reduceMotion) return
    const scope = createScope({ root }).add(() => {
      animate('.site-header', { opacity: [.4, 1], duration: 200, ease: 'outQuad' })
      animate('.editor', { opacity: [.2, 1], duration: 280, ease: 'outQuad' })
      animate('.upload-file-icon', { scale: [.85, 1], rotate: [-6, 0], duration: 320, ease: 'outCubic' })
    })
    return () => scope.revert()
  }, [root, reduceMotion])

  useEffect(() => {
    if (reduceMotion) return
    const scope = createScope({ root }).add(() => {
      animate('.tool-button.active svg', { rotate: [-10, 0], scale: [.85, 1], duration: 200, ease: 'outCubic' })
      animate('.property-tool > span', { backgroundColor: ['#263719', '#0e120a'], duration: 260, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [root, reduceMotion, state.tool])

  useEffect(() => {
    if (reduceMotion || !state.documentKey) return
    const scope = createScope({ root }).add(() => {
      // Only opacity changes: page coordinates stay stable while editing.
      animate('.pdf-surface > canvas', { opacity: [.35, 1], duration: 220, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [root, reduceMotion, state.documentKey, state.page])

  useEffect(() => {
    if (reduceMotion || !state.dialog) return
    const scope = createScope({ root }).add(() => {
      animate('.modal', { opacity: [0, 1], y: [10, 0], duration: 220, ease: 'outCubic' })
    })
    return () => scope.revert()
  }, [root, reduceMotion, state.dialog])

  useEffect(() => {
    if (reduceMotion || !state.notice) return
    const scope = createScope({ root }).add(() => {
      animate('.toast, .error-toast', { opacity: [0, 1], duration: 180, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [root, reduceMotion, state.notice])

  useEffect(() => {
    if (reduceMotion || !state.dragOver) return
    const scope = createScope({ root }).add(() => {
      animate('.drop-overlay', { opacity: [.25, 1], duration: 140, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [root, reduceMotion, state.dragOver])

  useEffect(() => {
    if (reduceMotion || !state.documentKey || !state.previewVersion) return
    const scope = createScope({ root }).add(() => {
      animate('.live-indicator', { color: ['#607448', '#bcff00'], duration: 240, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [root, reduceMotion, state.documentKey, state.previewVersion])
}
