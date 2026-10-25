import './PmYoutube.css'
export default function PmYoutube({
  id,
  start,
  width = 560,
  height = 315,
  caption,
}: {
  id: string
  start?: number
  width?: number
  height?: number
  caption?: string
}) {
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${start ? `?start=${start}` : ''}`
  return (
    <figure className="pm-media pm-youtube" data-kind="youtube">
      <iframe
        src={src}
        title={caption || 'YouTube'}
        width={width}
        height={height}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
