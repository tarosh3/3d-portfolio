import * as THREE from 'three'
import { experience, profile, projects, skillGroups } from '../portfolio-data'

export type PrintKind = 'magazine' | 'magazine-back' | 'fitnyx' | 'segmentation' | 'notebook' | 'notebook-notes' | 'education' | 'internship' | 'career' | 'door' | 'index' | 'mail' | 'lagoon-log' | 'shoreboard'

const ink = '#244e46'
const muted = '#678277'
const paper = '#f0e8d3'
const clay = '#af664b'

/** Compact printed graphics: the full portfolio lives in the optional reader. */
export function makeArtifactPrint(kind: PrintKind) {
  const canvas = document.createElement('canvas')
  const landscape = ['magazine', 'magazine-back'].includes(kind)
  canvas.width = 768
  canvas.height = landscape ? 512 : 1024
  const c = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  c.fillStyle = paper; c.fillRect(0, 0, w, h)
  // Deterministic paper fibers remain still and need no external bitmap assets.
  for (let i = 0; i < 900; i++) {
    const x = (i * 137.507) % w, y = (i * 73.919) % h
    c.fillStyle = i % 3 ? '#cabf9b16' : '#ffffff28'
    c.fillRect(x, y, 1 + i % 3, .7)
  }
  const text = (value: string, x: number, y: number, size = 34, color = ink, font = 'Georgia') => {
    c.fillStyle = color; c.font = `${size}px ${font}`; c.fillText(value, x, y)
  }
  const small = (value: string, x = 58, y = 75, color = muted) => text(value.toUpperCase(), x, y, 22, color, 'monospace')
  const line = (x1: number, y1: number, x2: number, y2: number, color = muted, width = 3) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke()
  }
  const rule = (y: number, color = muted) => line(58, y, w - 58, y, color, 2)
  const circle = (x: number, y: number, r: number, color: string) => {
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
  }
  const wrapped = (value: string, y: number, size = 34, width = 640, x = 58, color = ink) => {
    c.font = `${size}px Georgia`; c.fillStyle = color
    let row = ''
    for (const word of value.split(' ')) {
      const next = row ? `${row} ${word}` : word
      if (row && c.measureText(next).width > width) { c.fillText(row, x, y); y += size * 1.3; row = word } else row = next
    }
    c.fillText(row, x, y)
    return y
  }
  const node = (label: string, x: number, y: number, width = 230) => {
    c.fillStyle = '#d4dfc9'; c.fillRect(x, y, width, 77)
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(x, y, width, 77)
    text(label, x + 18, y + 47, 25, ink, 'monospace')
  }

  if (kind === 'magazine') {
    c.fillStyle = ink; c.fillRect(0, 0, w, 135)
    small('Notes from the island', 42, 59, paper)
    text('01 / PEOPLE & SYSTEMS', 42, 105, 21, '#c7d4bf', 'monospace')
    text('Tarosh', 47, 249, 94); text('Mathuria', 47, 345, 94)
    line(47, 380, 710, 380)
    small('Backend · Distributed systems · Go', 48, 439)
  } else if (kind === 'magazine-back') {
    small('Hello from New Delhi', 49, 74)
    wrapped('I build the systems behind everyday experiences.', 153, 51, 650, 49)
    rule(285)
    text('60,000+', 49, 361, 65, clay)
    small('Merchants on a platform I built', 49, 411)
    text('A little about me →', 49, 474, 27, muted)
  } else if (kind === 'fitnyx') {
    c.fillStyle = ink; c.fillRect(0, 0, w, h)
    small('Selected work / 01', 58, 77, '#bbd0b9')
    text(projects[0].name, 58, 183, 100, paper)
    text('FITNESS INTELLIGENCE', 60, 243, 23, '#c6d7be', 'monospace')
    // A small dashboard sketch, not a screenshot or invented product outcome.
    c.fillStyle = '#e5eacb'; c.fillRect(100, 315, 570, 414)
    c.fillStyle = '#c2d4b4'; c.fillRect(100, 315, 570, 53)
    for (let i = 0; i < 3; i++) circle(126 + i * 21, 341, 5, ink)
    text('WEEKLY ACTIVITY', 134, 409, 22, ink, 'monospace')
    for (let i = 0; i < 7; i++) {
      const barHeight = [55, 107, 85, 156, 128, 194, 176][i]
      c.fillStyle = i === 5 ? clay : '#5e8e78'; c.fillRect(141 + i * 68, 643 - barHeight, 38, barHeight)
    }
    line(133, 654, 636, 654, '#9bad8d', 2)
    text('AI coaching that remembers.', 58, 815, 42, paper)
    small('Go / Next.js / PostgreSQL', 58, 884, '#c6d7be')
    text('Explore the build →', 58, 960, 29, '#c6d7be')
  } else if (kind === 'segmentation') {
    small('Selected work / 02')
    text('Seeing the road.', 58, 176, 67)
    text('SEMANTIC SEGMENTATION', 58, 238, 23, muted, 'monospace')
    const x = 58, y = 304, vw = 652, vh = 360
    c.fillStyle = '#b6d1cf'; c.fillRect(x, y, vw, vh)
    c.fillStyle = '#d3bb99'; c.fillRect(x, y + 99, 167, vh - 99); c.fillRect(x + 467, y + 75, 185, vh - 75)
    c.fillStyle = '#69957c'; c.fillRect(x + 130, y + 180, 133, 180); c.fillRect(x + 420, y + 194, 129, 166)
    c.fillStyle = '#756a83'; c.beginPath(); c.moveTo(x + 276, y + 186); c.lineTo(x + 363, y + 186); c.lineTo(x + 594, y + vh); c.lineTo(x + 82, y + vh); c.closePath(); c.fill()
    c.fillStyle = '#ca775e'; c.fillRect(x + 267, y + 220, 100, 70)
    line(x + 320, y + 320, x + 327, y + vh, paper, 10)
    text('14 classes', 58, 758, 64, clay)
    text('71.27% accuracy', 58, 824, 47)
    small('U-Net / Published research / DTU', 58, 889)
    text('Read the research →', 58, 960, 29)
  } else if (kind === 'notebook') {
    small('Field notes / systems', 47, 80)
    text('Make it work.', 47, 160, 64)
    text('Make it last.', 47, 227, 64)
    for (let y = 290; y < 980; y += 47) line(35, y, 740, y, '#a9b7a230', 2)
    node('API / Go', 214, 328, 330)
    line(380, 405, 380, 465)
    node('Kafka', 214, 465, 330)
    line(380, 542, 380, 591); line(179, 591, 590, 591)
    line(179, 591, 179, 650); line(590, 591, 590, 650)
    node('Workers', 65, 650, 235); node('Storage', 474, 650, 235)
    text('Simple pieces.', 50, 840, 48, clay)
    text('Dependable systems.', 50, 900, 48, clay)
  } else if (kind === 'notebook-notes') {
    small('Tools of the trade', 46, 80)
    skillGroups.forEach((group, i) => {
      const y = 181 + i * 195
      text(`0${i + 1}`, 46, y, 29, clay, 'monospace')
      text(group.name, 111, y + 3, 55)
      wrapped(group.note, y + 67, 31, 570, 111, muted)
      line(111, y + 142, 707, y + 142, '#abb7a1', 1)
    })
  } else if (['education', 'internship', 'career'].includes(kind)) {
    const index = kind === 'education' ? 2 : kind === 'internship' ? 1 : 0
    const job = experience[index]
    const periods = ['2022 — NOW', 'JAN — JUN 2022', '2018 — 2022']
    const headings = ['Building at scale.', 'The first chapter.', 'The foundations.']
    small(periods[index], 54, 102)
    c.fillStyle = [ink, '#bc7859', '#7f9675'][index]; c.fillRect(54, 157, 655, 12)
    wrapped(headings[index], 267, 66, 645, 54)
    wrapped(index === 2 ? 'Delhi Technological University' : job.company, 490, 39, 640, 54)
    wrapped(job.title, 619, 35, 630, 54, muted)
    rule(786)
    wrapped(index === 2 ? '8.47 / 10 GPA' : index === 1 ? 'Logistics APIs & data pipelines' : '60,000+ merchants on ONDC', 856, 38, 642, 54)
  } else if (kind === 'door') {
    small('Currently building', 48, 113)
    wrapped(profile.role, 250, 69, 650, 48)
    rule(540)
    text('MAGICPIN', 48, 650, 67)
    text('Go · Commerce · AI', 48, 750, 38, muted)
    text('New Delhi, India', 48, 862, 35, muted)
  } else if (kind === 'index') {
    c.fillStyle = '#263e36'; c.fillRect(0, 0, w, h)
    small('Around the corner', 70, 118, '#b7c7ab')
    text('Made by', 70, 236, 84, paper); text('Tarosh.', 70, 335, 84, paper)
    line(70, 401, 695, 401, '#a2b799', 3)
    text('01   FitNyx', 70, 511, 53, paper)
    text('02   Seeing the road', 70, 628, 45, paper)
    text('Projects at the cabin', 70, 822, 39, '#c3d0b5')
    line(77, 905, 661, 905, paper, 8)
    line(77, 905, 145, 862, paper, 8); line(77, 905, 145, 948, paper, 8)
  } else if (kind === 'lagoon-log') {
    c.fillStyle = '#315c50'; c.fillRect(0, 0, w, h)
    small('Field log / 01', 58, 84, '#c7d5b7')
    text('Systems in', 58, 190, 68, paper); text('motion.', 58, 263, 68, paper)
    line(58, 316, 710, 316, '#a9c2a2', 3)
    text('60,000+', 58, 438, 82, '#e1b777')
    small('merchants on ONDC', 61, 487, '#c7d5b7')
    text('3,000', 58, 624, 74, '#e1b777')
    small('metro transactions / day at launch', 61, 672, '#c7d5b7')
    node('Go → Kafka → Redis', 58, 770, 652)
    text('Beckn protocol · QR tickets · distributed locks', 58, 925, 24, '#c7d5b7', 'monospace')
  } else if (kind === 'shoreboard') {
    c.fillStyle = '#765a43'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#d9c395'; c.fillRect(26, 26, w - 52, h - 52)
    small('Field board / 02', 60, 92, '#607866')
    text('Built to', 60, 205, 76, ink); text('last.', 60, 288, 76, ink)
    rule(342, '#8da28a')
    text('Go', 60, 460, 47, clay); text('Kafka', 245, 460, 47, clay); text('Kubernetes', 60, 558, 43, clay); text('Prometheus', 370, 558, 43, clay)
    line(60, 640, 710, 640, '#8da28a', 3)
    text('30–40%', 60, 758, 72, ink)
    small('less infrastructure cost after the catalog rebuild', 61, 812, '#607866')
    text('Bounded workers · retries · right-sized workloads', 60, 946, 24, '#607866', 'monospace')
  } else {
    c.fillStyle = ink; c.fillRect(0, 0, w, h)
    small('Island post', 90, 148, '#bdcdb5')
    c.strokeStyle = paper; c.lineWidth = 13; c.strokeRect(147, 316, 474, 293)
    line(147, 316, 384, 491, paper, 13); line(384, 491, 621, 316, paper, 13)
    text('Say hello.', 102, 765, 92, paper)
    small('Tarosh Mathuria', 113, 884, '#bdcdb5')
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
