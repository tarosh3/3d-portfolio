/** Portfolio facts carried forward from the original island experience. */
export const profile = {
  name: 'Tarosh Mathuria',
  role: 'Senior Software Engineer II',
  location: 'New Delhi, India',
  tagline: 'Senior Engineer. Island dweller. Distributed systems guy.',
  bio: '4+ years shipping production systems that actually scale. ONDC platforms serving 60,000+ merchants, metro ticketing across Delhi/Mumbai/Bangalore, and an MCP server so powerful you can order food through Claude. Based in New Delhi. Powered by Go and probably too much coffee.',
  summary: 'I build the systems behind everyday experiences. From commerce for 60,000+ merchants to metro journeys and AI agents, I turn complex problems into dependable software.',
  specialties: 'Backend · Distributed Systems · Go',
  contactIntro: 'Open to senior backend, distributed systems, and infrastructure roles — especially teams building at real scale. ONDC, fintech, AI infra, or anything with a genuinely hard problem worth solving.',
  contactNote: 'Currently building from New Delhi. Remote-friendly. Always caffeinated.',
} as const

export const skillGroups = [
  {
    name: 'Build',
    note: 'Go services and the protocols that connect them.',
    skills: ['Go (Primary)', 'Distributed Systems', 'Microservices · REST', 'Beckn / ONDC Protocol'],
  },
  {
    name: 'Scale',
    note: 'Event pipelines, durable data, and cloud infrastructure.',
    skills: ['Kafka · Event Pipelines', 'PostgreSQL · MongoDB · Redis', 'Kubernetes · GCP'],
  },
  {
    name: 'Operate',
    note: 'Visibility, delivery, and day-to-day operations.',
    skills: ['Prometheus', 'CI/CD · Bitbucket Pipelines', 'GCS · GKE · BigQuery'],
  },
  {
    name: 'Explore',
    note: 'LLMs that can take action.',
    skills: ['LLM Integration · MCP Servers', 'WhatsApp AI Agents'],
  },
] as const

export const projects = [
  {
    id: 'fitnyx',
    name: 'FitNyx',
    tabLabel: 'FitNyx',
    subtitle: 'Personal Project · Feb 2026 → Now',
    category: 'Fitness intelligence',
    description: 'Full-stack fitness intelligence platform. Go (Echo) + Next.js PWA. AI coaching with persistent LLM thread state. PostgreSQL pg_trgm search, Redis rate limiting, Cloudinary CDN.',
    summary: 'A full-stack fitness platform with AI coaching that remembers the conversation. Built as a Next.js PWA with a Go (Echo) backend.',
    detail: 'PostgreSQL pg_trgm search, Redis rate limiting, and Cloudinary CDN.',
    tags: ['Go', 'Next.js', 'PostgreSQL', 'LLM', 'Redis'],
  },
  {
    id: 'segmentation',
    name: 'Self-Driving Segmentation',
    tabLabel: 'Self-driving research',
    subtitle: 'Published Research · DTU',
    category: 'Computer vision',
    description: 'Co-authored U-Net based semantic segmentation for autonomous driving. 71.27% accuracy across 14 semantic classes. Published at Delhi Technological University.',
    summary: 'Co-authored U-Net based semantic segmentation for autonomous driving, published at Delhi Technological University.',
    detail: '71.27% accuracy across 14 semantic classes.',
    tags: ['Computer Vision', 'U-Net', 'Python', 'Published'],
  },
] as const

export const experience = [
  {
    id: 'magicpin-senior',
    company: 'MAGICPIN',
    title: 'Senior Software Engineer II',
    tabLabel: 'Senior engineer',
    period: 'Jul 2022 → Present · Gurugram',
    bullets: [
      'Built ONDC Seller App (BPP) from scratch in Go serving 60,000+ merchants',
      'Architected multi-tenant SaaS for Tata Digital, Paytm, Ola, PostPe',
      'Re-architected catalog pipeline to Kafka + worker pools — cut infra cost 30–40%',
      'Metro transit ticketing across Delhi, Mumbai, Bangalore — 3,000 txns/day at launch',
      'Built production MCP server: order food through Claude',
      'WhatsApp AI sales agent for merchant acquisition',
    ],
    highlights: [
      'Built a Go commerce platform serving 60,000+ merchants.',
      'Kafka catalog pipeline cut infrastructure costs 30–40%.',
      'Metro ticketing in 3 cities; 3,000 transactions/day at launch.',
      'Shipped a production MCP server and WhatsApp AI sales agent.',
    ],
  },
  {
    id: 'magicpin-intern',
    company: 'MAGICPIN',
    title: 'Software Engineering Intern',
    tabLabel: 'Internship',
    period: 'Jan 2022 → Jun 2022 · Gurugram',
    bullets: [
      'Shiprocket logistics APIs for end-to-end fulfillment',
      'Web scraping and crawling pipelines for merchant data',
    ],
    highlights: [
      'Integrated Shiprocket logistics APIs for end-to-end fulfillment.',
      'Built web scraping and crawling pipelines for merchant data.',
    ],
  },
  {
    id: 'dtu',
    company: 'DELHI TECHNOLOGICAL UNIVERSITY',
    title: 'B.Tech, Software Engineering',
    tabLabel: 'Education',
    period: '2018 → 2022',
    bullets: ['GPA: 8.47 / 10'],
    highlights: ['GPA: 8.47 / 10'],
  },
] as const

export const contacts = [
  { label: 'Email', value: 'taroshmathuria@gmail.com', href: 'mailto:taroshmathuria@gmail.com', external: false },
  { label: 'LinkedIn', value: 'linkedin.com/in/tarosh', href: 'https://linkedin.com/in/tarosh', external: true },
] as const

/** Focused field notes for the lagoon log and the west-shore board. */
export const fieldNotes = {
  lagoon: {
    edition: 'The lagoon field log',
    title: 'Systems in motion.',
    introduction: 'Behind an order or a metro ticket is a system that has to work. These are two of the everyday experiences I’ve helped build at Magicpin.',
    metrics: [
      { value: '60,000+', label: 'merchants served by the ONDC seller app' },
      { value: '3,000', label: 'metro transactions per day at launch' },
    ],
    entries: [
      {
        label: '01 / Commerce',
        title: 'A platform for the local merchant.',
        body: 'Built the ONDC Seller App (BPP) from scratch in Go. The work also included a multi-tenant SaaS platform for Tata Digital, Paytm, Ola and PostPe.',
        detail: 'Go · Beckn / ONDC · Multi-tenant SaaS',
      },
      {
        label: '02 / Transit',
        title: 'From an API to the next train.',
        body: 'Built metro transit ticketing across Delhi, Mumbai and Bangalore, handling 3,000 transactions per day at launch.',
        detail: 'Delhi · Mumbai · Bangalore',
      },
    ],
  },
  west: {
    edition: 'The west-shore field board',
    title: 'Built to last.',
    introduction: 'A closer look at the catalog pipeline at Magicpin: changing the architecture to reduce the infrastructure it needs.',
    metric: { value: '30–40%', label: 'reduction in infrastructure cost' },
    change: 'Re-architected the catalog pipeline around Kafka and worker pools.',
    flow: ['Catalog pipeline', 'Kafka', 'Worker pools'],
    toolkitTitle: 'The tools around the work.',
    toolkitBody: 'My broader infrastructure toolkit spans cloud deployment, observability and delivery. These are the tools I bring to operating backend systems.',
    tools: [
      { name: 'Deploy', items: 'Kubernetes · GCP · GKE' },
      { name: 'Observe', items: 'Prometheus' },
      { name: 'Deliver', items: 'CI/CD · Bitbucket Pipelines' },
    ],
  },
} as const

export const chapters = [
  { stage: 1, label: 'About', title: 'Hello, I’m Tarosh.' },
  { stage: 2, label: 'Skills', title: 'Tools of the trade.' },
  { stage: 3, label: 'Projects', title: 'Ideas, out in the world.' },
  { stage: 4, label: 'Experience', title: 'The journey so far.' },
  { stage: 5, label: 'Contact', title: 'Let’s build something.' },
] as const

/** Short, browsable editions for the small objects around the island. */
export const letterPages = [
  {
    title: 'Hello, I’m Tarosh.',
    paragraphs: [
      'I’m a backend engineer from New Delhi. I build the systems behind the everyday things — ordering a meal, catching the metro, or talking to an AI.',
      'These days, that means Go, distributed systems, and 4+ years of getting things into the world.',
    ],
    postscript: 'Usually thinking in Go. Often over coffee.',
  },
  {
    title: 'A little of my work.',
    paragraphs: [
      'At Magicpin, I built an ONDC platform serving 60,000+ merchants, and metro ticketing across Delhi, Mumbai, and Bangalore.',
      'I also build AI tools — including a production MCP server that lets you order food through Claude.',
    ],
    postscript: 'There’s more to discover around the island.',
  },
] as const

export const resumePages = [
  { role: experience[0], label: 'Commerce & scale', bullets: experience[0].bullets.slice(0, 3) },
  { role: experience[0], label: 'Transit & AI', bullets: experience[0].bullets.slice(3) },
  { role: experience[1], label: 'The first chapter', bullets: experience[1].bullets },
  { role: experience[2], label: 'The foundations', bullets: experience[2].bullets },
] as const
