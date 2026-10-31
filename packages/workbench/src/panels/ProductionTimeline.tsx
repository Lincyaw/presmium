import { useEffect, useRef, useState } from 'react'
import type { ProductionPlan } from '@lincyaw/kernel'
import { sameProductionBinding } from '@lincyaw/kernel'
import { PmTimeline } from '../components.tsx'
import type { TimelineTrack } from '../components.tsx'
import { AudioWaveforms } from '../audio-waveform.ts'
import type { AudioWaveform } from '../audio-waveform.ts'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'

/** Projects the server's one plan into this page's relative ruler; it never computes a second schedule. */
export function ProductionTimeline({ plan, sectionId, stepId, active, current, seekEnabled, loading, seeking, disabled, onSeek, onSelectStep }: {
  plan?: ProductionPlan, sectionId: string, stepId: string, active: boolean, current: boolean, seekEnabled: boolean,
  loading: boolean, seeking: boolean, disabled: boolean, onSeek(timeMs: number): void, onSelectStep(stepId: string): void,
}) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), p = PRODUCTION_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring), playback = useWorkbenchState(state => state.productionPlayback)
  const directory = useWorkbenchState(state => state.document)
  const reader = useRef<AudioWaveforms>(), [waveState, setWaves] = useState<{ planId?: string, values: Record<string, AudioWaveform | false> }>({ values: {} })
  const waves = waveState.planId === plan?.binding.planId ? waveState.values : {}
  const [zoom, setZoom] = useState(1)
  useEffect(() => { reader.current = new AudioWaveforms(); return () => { reader.current?.dispose(); reader.current = undefined } }, [])
  useEffect(() => {
    setWaves({ planId: plan?.binding.planId, values: {} })
    if (!active || !current || !plan || directory === undefined) return
    const controller = new AbortController(), decoder = reader.current
    if (!decoder) return
    const audio = new Map(plan.tracks.flatMap(track => track.kind === 'voice' ? track.segments.filter(segment => segment.sectionId === sectionId && segment.status === 'cached' && segment.audio).map(segment => [segment.audio!.clipId, segment.audio!] as const) : []))
    for (const clip of audio.values()) {
      void decoder.read(JSON.stringify([plan.binding.planId, clip.clipId, clip.sha256]), signal => workbench.client.readProductionMedia(directory, { ...plan.binding, clipId: clip.clipId }, signal), clip.durationMs, controller.signal).then(
        value => { if (!controller.signal.aborted) setWaves(previous => previous.planId === plan.binding.planId ? { ...previous, values: { ...previous.values, [clip.clipId]: value } } : previous) },
        () => { if (!controller.signal.aborted) setWaves(previous => previous.planId === plan.binding.planId ? { ...previous, values: { ...previous.values, [clip.clipId]: false } } : previous) },
      )
    }
    return () => controller.abort()
  }, [workbench, directory, plan, sectionId, active, current])
  const document = source?.content, section = document?.sections[sectionId]
  const page = current ? plan?.pages.find(page => page.sectionId === sectionId) : undefined
  const start = page?.startMs, end = page?.endMs, duration = start !== undefined && end !== undefined ? Math.max(0, end - start) : undefined
  const position = plan && current && playback && sameProductionBinding(playback.binding, plan.binding) && playback.position?.sectionId === sectionId && start !== undefined ? Math.max(0, playback.position.timeMs - start) : undefined
  const tracks: TimelineTrack[] = page && plan ? plan.tracks.map(track => ({ id: track.kind, label: p.tracks[track.kind], segments: track.segments.filter(segment => segment.sectionId === sectionId).map(segment => {
    const step = document?.steps[segment.stepId], index = section?.stepOrder.indexOf(segment.stepId) ?? -1
    const wave = track.kind === 'voice' && segment.audio ? waves[segment.audio.clipId] : undefined
    const status = segment.status ? p.segmentStatus[segment.status] : undefined
    return { id: segment.id, stepId: segment.stepId, timing: segment.timing,
      label: track.kind === 'visual' ? step?.title ?? p.stepNumber(Math.max(0, index)) : segment.label,
      ...segment.startMs !== undefined && start !== undefined ? { startMs: Math.max(0, segment.startMs - start) } : {},
      ...segment.endMs !== undefined && start !== undefined ? { endMs: Math.max(0, segment.endMs - start) } : {},
      statusLabel: [status, track.kind === 'caption' && p.alignmentStatus[segment.alignment ?? 'none'], segment.audio && (wave === false ? p.waveformUnavailable : wave === undefined ? p.waveformLoading : undefined)].filter(Boolean).join(' · '),
      waveform: wave ? wave.peaks : undefined,
    }
  }) })) : [{ id: 'visual', label: p.tracks.visual, segments: section?.stepOrder.map((id, index) => ({ id, stepId: id, label: document?.steps[id]?.title ?? p.stepNumber(index), timing: 'unknown' as const })) ?? [] }, { id: 'voice', label: p.tracks.voice, segments: [] }, { id: 'caption', label: p.tracks.caption, segments: [] }]
  const captionChoices = current ? plan?.tracks.find(track => track.kind === 'caption')?.segments.filter(segment => segment.stepId === stepId && (segment.alignment === 'words' || segment.alignment === 'manual') && segment.timing === 'confirmed').map(segment => segment.id) ?? [] : []
  return <PmTimeline label={p.timeline} tracks={tracks} labels={p.timelineLabels} durationMs={duration} durationStatus={page?.timing ?? 'unknown'} currentTimeMs={position} selectedStepId={stepId} showSteps={false}
    segmentPicker={{ track: 'caption', ids: captionChoices, label: p.captionSegment, placeholder: p.chooseCaptionSegment }}
    zoom={zoom} onZoomChange={setZoom} disabled={disabled} loading={loading} seeking={seeking} seekDisabled={!seekEnabled || start === undefined}
    onSelectStep={onSelectStep} onSelectSegment={(track, selected) => {
      const segment = current ? plan?.tracks.find(value => value.kind === track)?.segments.find(value => value.id === selected.id) : undefined
      if (track === 'caption' && seekEnabled && (segment?.alignment === 'words' || segment?.alignment === 'manual') && segment.timing === 'confirmed' && segment.startMs !== undefined) onSeek(segment.startMs)
      else if (selected.stepId) onSelectStep(selected.stepId)
    }} onSeek={time => { if (start !== undefined) onSeek(start + time) }} />
}
