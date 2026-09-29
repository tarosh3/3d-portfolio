export type AreaId = 'overview' | 'veranda' | 'cabin' | 'deck' | 'hammock' | 'pier' | 'beach' | 'lagoon' | 'west'
export type ReadRequest = { stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; item?: number; source?: 'door' }
export type Vec3 = [number, number, number]
export type IslandArea = {
  id: AreaId; label: string; chapter: string; description: string; hint: string
  position: Vec3; target: Vec3; range: [number, number]; arc: number
  map: [number, number]; read?: ReadRequest; readLabel?: string; compactDescription?: string
}
export const AREAS: IslandArea[] = [
  { id: 'overview', label: 'Whole island', chapter: 'Welcome ashore', description: 'A small island. A world of things to build.', hint: 'Choose a place, or just look around.', position: [25, 17, 23], target: [1, 2.6, 0], range: [24, 65], arc: Math.PI, map: [46, 49] },
  { id: 'veranda', label: 'The veranda', chapter: '01 / A little about me', description: 'An introduction, left open on the coffee table.', hint: 'Open the magazine. Stay for a look around.', position: [-1.7, 4.4, 1.8], target: [-1, 3.25, -.1], range: [2, 5], arc: .42, map: [44, 47], read: { stage: 1 } },
  { id: 'cabin', label: 'Project cabin', chapter: '02 / Selected work', description: 'Two ideas that made it out into the world.', hint: 'Find the project posters on the wooden wall.', position: [-7.1, 4.9, 8.7], target: [-3.9, 3.4, 4.8], range: [4.8, 14], arc: .45, map: [31, 64], read: { stage: 3 } },
  { id: 'deck', label: 'The rear deck', chapter: '03 / Under the hood', description: 'A quiet spot for systems, sketches and engineering notes.', hint: 'There’s a notebook beside the loungers.', position: [1.25, 4.6, -7.5], target: [-1.8, 3.15, -6.6], range: [3.2, 8], arc: .45, map: [36, 25], read: { stage: 2 } },
  { id: 'hammock', label: 'Hammock stories', chapter: '04 / The journey so far', description: 'From university to systems used by thousands.', hint: 'Three chapters, pegged between the palms.', position: [5.5, 3.8, 9], target: [.9, 3.9, 8.9], range: [4.6, 14], arc: .48, map: [47, 82], read: { stage: 4 } },
  { id: 'pier', label: 'The postbox', chapter: '05 / Keep in touch', description: 'Have a hard problem worth solving? Leave a note.', hint: 'The little postbox is beside the walkway.', position: [12, 6, 6], target: [6.4, 2.5, .7], range: [6, 18], arc: .8, map: [71, 48], read: { stage: 5 } },
  { id: 'beach', label: 'The beach', chapter: 'Off the beaten path', description: 'A little room to slow down.', hint: 'Try dusk. Look around the cooler and the palms.', position: [4, 4.5, 7], target: [0, 2.8, 4.6], range: [4.6, 14], arc: .38, map: [45, 65] },
  { id: 'lagoon', label: 'The lagoon', chapter: '06 / Systems in motion', description: 'Commerce for 60,000+ merchants. Metro ticketing across three cities.', hint: 'The tide log tells the story of systems at scale.', position: [14, 7, -4], target: [8, 1.5, 1], range: [6, 20], arc: 1.1, map: [79, 68], read: { stage: 6 }, readLabel: 'Open the tide log', compactDescription: '60,000+ merchants · Three metro cities.' },
  { id: 'west', label: 'West shore', chapter: '07 / Built to last', description: 'A catalog pipeline rebuilt. Infrastructure costs reduced by 30–40%.', hint: 'Open the field board beneath the satellite dish.', position: [-20, 10, -2], target: [-3.5, 3, -.5], range: [15, 35], arc: 1.2, map: [16, 44], read: { stage: 7 }, readLabel: 'Read the field board', compactDescription: '30–40% lower infrastructure cost.' },
]
export const areaById = (id: AreaId) => AREAS.find(area => area.id === id)!
export const TOUR: AreaId[] = ['veranda', 'cabin', 'deck', 'hammock', 'pier', 'beach', 'lagoon', 'west']

// A taller lens keeps portrait cameras in their inspected neighborhood instead
// of backing them through another palm to fit the same horizontal subject.
export const cameraFov = (aspect: number) => 45 + 27 * Math.max(0, Math.min(1, (1.1 - aspect) / .64))
export const cameraScale = (aspect: number) => Math.max(1, .82 / aspect * Math.tan(Math.PI / 8) / Math.tan(cameraFov(aspect) * Math.PI / 360))
