/** Small, self-contained artwork: every moving layer is an HTML transform.
 * No SVG path mutation, filters, canvas, image download or JavaScript clock. */
export default function LoadingArtwork() {
  return <figure className="arrival-art" aria-hidden="true">
    <div className="arrival-art-stage">
      <div className="arrival-sun" />
      <div className="arrival-tide arrival-tide-one" /><div className="arrival-tide arrival-tide-two" /><div className="arrival-tide arrival-tide-three" />
      <div className="arrival-cloud arrival-cloud-back"><svg viewBox="0 0 180 70" fill="none"><path d="M12 53C0 42 11 28 27 30 20 2 61-7 72 20 85 5 109 13 111 28 135 13 160 27 156 41 178 36 187 57 166 61H27Z" fill="currentColor" /></svg></div>
      <div className="arrival-islet"><svg viewBox="0 0 600 480" fill="none">
        <defs><g id="loader-palm">
          <path d="M0 61C8 36 8 14 0 0" stroke="#9b9568" strokeWidth="7" strokeLinecap="round" />
          <path d="M1 1C-8-32-43-39-59-12-34-26-17-15 1 1Z" fill="#83916a" />
          <path d="M1 1C-27-14-52 1-54 25-35 5-17 11 1 1Z" fill="#a2aa75" />
          <path d="M1 1C-5-30 13-52 37-42 14-34 18-12 1 1Z" fill="#b0b681" />
          <path d="M1 1C18-26 52-25 60 0 34-14 22 3 1 1Z" fill="#8c9c72" />
          <path d="M1 1C31-5 48 14 39 34 24 11 14 16 1 1Z" fill="#607e63" />
          <circle r="5" fill="#c7b37b" />
        </g></defs>
        <ellipse cx="304" cy="334" rx="183" ry="65" fill="#0f3038" opacity=".35" />
        <path d="M116 275c5-56 85-99 178-94 82-4 174 23 190 72 13 41-35 80-100 99-83 26-171 7-222-27-25-14-40-29-46-50Z" fill="#9d9b78" />
        <path d="M116 260c5-56 85-99 178-94 82-4 174 23 190 72 13 41-35 80-100 99-83 26-171 7-222-27-25-14-40-29-46-50Z" fill="#e0d3a3" />
        <path d="M125 265c19 30 72 59 128 70 61 15 123 0 171-24" stroke="#eee3bb" strokeWidth="3" strokeLinecap="round" />
        <path d="m375 274 102 30 13-13-96-33Z" fill="#b5aa7f" />
        <path d="m401 274 80 25m-66-32-4 11m20-6-4 11m21-6-5 11m20-6-4 11" stroke="#e9d9a6" strokeWidth="2" />
        <path d="M397 274v15m84 5v15" stroke="#837e62" strokeWidth="4" />
        <path d="m214 243 89-51 101 59-90 52Z" fill="#b3aa80" />
        <path d="m236 223 68 38v58l-68-39Z" fill="#b1a076" />
        <path d="m304 261 73-42v58l-73 42Z" fill="#778672" />
        <path d="m249 245 19 11v22l-19-11Zm37 22 10 6v35l-10-6Z" fill="#3e625b" />
        <path d="m329 257 27-16v23l-27 16Z" fill="#2e5552" />
        <path d="m221 226 77-69 92 45-79 73Z" fill="#cebc86" />
        <path d="m298 157 13 118 79-73Z" fill="#a69c72" />
        <path d="m221 226 90 49 79-73m-79 73-13-118" stroke="#eddbac" strokeWidth="2" strokeLinejoin="round" />
        <path d="m240 209 66 36m-53-48 51 27m-38-39 37 19m21 55 52-48m-56 23 42-39" stroke="#e4cf9b" strokeOpacity=".45" />
        <path d="m223 273 82 47 84-48m-166 14 82 48 84-49m-166-13v27m82 22v25m84-48v20" stroke="#e8d9ab" strokeWidth="3" />
        <path d="m185 283 31 17-26 15-31-18Z" fill="#96a47a" />
        <path d="m194 277 20 10-7 10-22-11Z" fill="#486d60" />
        <use href="#loader-palm" transform="translate(204 186) scale(.77)" />
        <use href="#loader-palm" transform="translate(389 185) scale(.9)" />
        <use href="#loader-palm" transform="translate(164 254) scale(.8) rotate(-8)" />
        <use href="#loader-palm" transform="translate(323 295) scale(.73) rotate(14)" />
        <path d="m362 316 13-8 12 4-12 9Z" fill="#7d946d" /><path d="m244 306 11-5 9 4-10 6Z" fill="#8d9d75" />
      </svg></div>
      <div className="arrival-cloud arrival-cloud-front"><svg viewBox="0 0 180 70"><path d="M12 53C0 42 11 28 27 30 20 2 61-7 72 20 85 5 109 13 111 28 135 13 160 27 156 41 178 36 187 57 166 61H27Z" fill="currentColor" /></svg></div>
      <div className="arrival-boat"><svg viewBox="0 0 90 70" fill="none"><path d="m14 49 61-6-11 14-35 4Z" fill="#e0ce9b" /><path d="M47 8v36H19Z" fill="#f1e6c6" /><path d="m51 18 18 23-18 2Z" fill="#b9c7ad" /><path d="m48 7 2 39" stroke="#b2a984" strokeWidth="2" /><path d="M10 63h46M2 67h33" stroke="#719d97" strokeLinecap="round" /></svg></div>
    </div>
    <figcaption><span>A SMALL WORLD, WORTH EXPLORING</span><span>01 / ∞</span></figcaption>
  </figure>
}
