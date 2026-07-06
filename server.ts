import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { Category, PriorityLevel, ComplaintStatus, Complaint, Comment, ActivityLog, AnalyticsSummary, PlanningReport } from './src/types.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = 3000;

// Parse JSON payloads up to 50MB (to allow mock citizen image uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to lazy-initialize the Gemini client to prevent startup crashes when key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    console.warn('⚠️ WARNING: GEMINI_API_KEY is not set or using placeholder. Running in Fallback Simulator mode.');
    return null;
  }
  
  try {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    return aiClient;
  } catch (err) {
    console.error('❌ Failed to initialize Gemini API Client:', err);
    return null;
  }
}

// In-Memory Seed Database
let complaints: Complaint[] = [
  {
    id: 'comp-101',
    title: 'Huge Water Pipeline Leak on Oak Avenue',
    description: 'Water is gushing out of a main pipe joint since early morning. The entire street is flooded and water pressure in nearby houses has dropped significantly. Hundreds of gallons of clean drinking water are being wasted.',
    category: 'Water Supply',
    latitude: 37.7858,
    longitude: -122.4064,
    contactName: 'Sarah Jenkins',
    contactEmail: 'sarah.j@example.com',
    upvotes: 34,
    votedUserEmails: ['user1@example.com', 'user2@example.com'],
    status: 'In Progress',
    ward: 'Ward 7 - Riverside',
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), // 2 days ago
    aiPriority: 'High',
    aiPriorityReasoning: 'Loss of critical resource (drinking water), local road flooding rendering sidewalks impassable, and potential low-pressure impact on nearby schools.',
    aiCategorySuggested: 'Water Supply',
    aiSafetyRecommendations: [
      'Avoid walking or driving directly through flooded areas as road surface integrity cannot be guaranteed.',
      'Check local water authority notices for scheduled pressure drops in surrounding grid grids.'
    ],
    aiOfficerRecommendations: [
      'Deploy main valve shutoff crew immediately to stem active loss.',
      'Notify regional distribution grid supervisor regarding grid pressure balancing.',
      'Dispatch heavy machinery and pipeline repair technicians for joint welding.'
    ],
    aiAssignedDepartment: 'Municipal Water Authority',
    comments: [
      {
        id: 'comm-1',
        authorName: 'Municipal Engineer Marcus',
        text: 'Crew has located the section valve. Temporary clamp being fitted while we wait for full replacement parts.',
        timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        isInternal: true
      },
      {
        id: 'comm-2',
        authorName: 'Robert K.',
        text: 'Flood is reaching my garden. Hopefully they patch it up today!',
        timestamp: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        isInternal: false
      }
    ],
    logs: [
      {
        id: 'log-1',
        title: 'Complaint Logged',
        description: 'Citizen filed grievance via Constituency Connect.',
        timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        authorName: 'Sarah Jenkins'
      },
      {
        id: 'log-2',
        title: 'AI Intel Review Completed',
        description: 'Auto-categorized as Water Supply; prioritized as High. Preliminary recommendations routed to Municipal Water Authority.',
        timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        authorName: 'AI Engine'
      },
      {
        id: 'log-3',
        title: 'Status Updated to In Progress',
        description: 'Assigned to Sector 4 Repair Division.',
        timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        authorName: 'Director Henderson'
      }
    ]
  },
  {
    id: 'comp-102',
    title: 'Uncollected Trash in Central Market Alley',
    description: 'Garbage has not been collected for the last 5 days. The main dumpsters are overflowing, attracting stray dogs, rats, and creating a severe stench near open food stalls. Extremely unhygienic conditions.',
    category: 'Sanitation & Waste',
    latitude: 37.7719,
    longitude: -122.4224,
    contactName: 'David Chen',
    contactEmail: 'david.chen@marketfoods.org',
    upvotes: 18,
    votedUserEmails: [],
    status: 'Pending',
    ward: 'Ward 8 - High Street',
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), // 12 hours ago
    aiPriority: 'Medium',
    aiPriorityReasoning: 'Biohazard threat due to organic rot and rodent vectors adjacent to public food establishments. Not immediate physical danger, but highly unhygienic.',
    aiCategorySuggested: 'Sanitation & Waste',
    aiSafetyRecommendations: [
      'Avoid directly handling waste; keep food prep stations covered and sanitized.',
      'Notify the Market Vendor Association to restrict disposal until dumpsters are cleared.'
    ],
    aiOfficerRecommendations: [
      'Dispatch special high-capacity refuse collector truck and cleaning crew.',
      'Perform chemical sanitation of alleyway post-collection to mitigate biohazard.',
      'Check route log to verify why standard bi-weekly collection was missed.'
    ],
    aiAssignedDepartment: 'Sanitation & Waste Management',
    comments: [],
    logs: [
      {
        id: 'log-4',
        title: 'Complaint Logged',
        description: 'Citizen filed grievance via Constituency Connect.',
        timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        authorName: 'David Chen'
      }
    ]
  },
  {
    id: 'comp-103',
    title: 'Dangerous Deep Pothole Near Primary School Corner',
    description: 'There is a massive, deep pothole right at the corner crossing of Riverside Primary School. Two children on scooters slipped yesterday. It is filled with muddy water when it rains, hiding its true depth.',
    category: 'Roads & Traffic',
    latitude: 37.7618,
    longitude: -122.3988,
    contactName: 'Linda Albright',
    contactEmail: 'linda.a@schoolboard.org',
    upvotes: 56,
    votedUserEmails: ['user1@example.com'],
    status: 'Under Review',
    ward: 'Ward 7 - Riverside',
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(), // 3 days ago
    aiPriority: 'Critical',
    aiPriorityReasoning: 'High-risk location near vulnerable population (primary school children). Immediate physical injury hazards reported. Obscured depth (muddy water) exacerbates hazard.',
    aiCategorySuggested: 'Roads & Traffic',
    aiSafetyRecommendations: [
      'Pedestrians should cross 10 meters further up the street, away from the active corner.',
      'Drivers should slow down to 10mph near the school bend to prevent tire blowouts or vehicle skidding.'
    ],
    aiOfficerRecommendations: [
      'Erect temporary orange safety cones or warning barricades immediately.',
      'Schedule emergency cold-mix asphalt patch within 12 hours.',
      'Review complete street resurfacing schedule for school zones.'
    ],
    aiAssignedDepartment: 'Department of Public Works',
    comments: [
      {
        id: 'comm-3',
        authorName: 'Officer Patterson',
        text: 'Inspected the site. Set up temporary hazard cones today to prevent school traffic from driving into it.',
        timestamp: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        isInternal: true
      }
    ],
    logs: [
      {
        id: 'log-5',
        title: 'Complaint Logged',
        description: 'Citizen filed grievance via Constituency Connect.',
        timestamp: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
        authorName: 'Linda Albright'
      },
      {
        id: 'log-6',
        title: 'Urgent AI Elevation',
        description: 'AI Engine flagged safety critical indicators: "school zone" & "children fell". Status raised to Critical.',
        timestamp: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
        authorName: 'AI Engine'
      }
    ]
  },
  {
    id: 'comp-104',
    title: 'Complete Streetlight Blackout on Maple Boulevard',
    description: 'A stretch of about 12 streetlights on Maple Boulevard is completely dark. Walking home from the subway station feels unsafe, and there are already reports of local car window break-ins in the shadows.',
    category: 'Streetlights & Electricity',
    latitude: 37.7428,
    longitude: -122.4388,
    contactName: 'James McCreadie',
    contactEmail: 'jmccreadie@outlook.com',
    upvotes: 29,
    votedUserEmails: [],
    status: 'In Progress',
    ward: 'Ward 12 - Old Town',
    createdAt: new Date(Date.now() - 96 * 3600 * 1000).toISOString(), // 4 days ago
    aiPriority: 'High',
    aiPriorityReasoning: 'Long blacked-out stretch increases crime rate and decreases pedestrian security. Direct correlation with local auto-theft incidents.',
    aiCategorySuggested: 'Streetlights & Electricity',
    aiSafetyRecommendations: [
      'Use the lit sidewalk on the parallel street if walking home alone at night.',
      'Carry a flashlight or use your phone torch to remain visible to oncoming vehicles.'
    ],
    aiOfficerRecommendations: [
      'Inspect substation feeder line for localized transformer trip.',
      'Check control photocell or timer unit that regulates street illumination schedules.',
      'Verify if bulbs require comprehensive LED upgrade.'
    ],
    aiAssignedDepartment: 'Grid & Lighting Directorate',
    comments: [],
    logs: [
      {
        id: 'log-7',
        title: 'Complaint Logged',
        description: 'Citizen filed grievance.',
        timestamp: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
        authorName: 'James McCreadie'
      }
    ]
  }
];

// Helper to simulate Gemini outputs for clean fallback if GEMINI_API_KEY is not configured
function simulateGeminiAnalysis(title: string, description: string, userCategory: Category): any {
  const normalizedText = (title + ' ' + description).toLowerCase();
  
  let suggestedCategory: Category = userCategory;
  let priority: PriorityLevel = 'Medium';
  let reasoning = 'Assigned medium default priority. Requires manual administrative evaluation.';
  let department = 'Public Administration Sector';
  let safetyRecs = ['Exercise normal caution around the described zone.', 'Keep a safe distance if structural elements appear unstable.'];
  let officerRecs = ['Dispatch general inspector to verify scope of work.', 'Confirm municipal jurisdiction and budget allocation.'];

  if (normalizedText.includes('water') || normalizedText.includes('pipe') || normalizedText.includes('leak') || normalizedText.includes('flood')) {
    suggestedCategory = 'Water Supply';
    priority = normalizedText.includes('gush') || normalizedText.includes('main') || normalizedText.includes('flood') ? 'High' : 'Medium';
    reasoning = 'Identified indicators of localized flooding or potable water loss. Priority assigned based on water waste and property risk.';
    department = 'Municipal Water Authority';
    safetyRecs = [
      'Do not approach raw utility leaks. Report any dirty residential tap water immediately.',
      'Turn off electronic devices if basement flooding occurs.'
    ];
    officerRecs = [
      'Locate nearest grid isolation valve and cut flow.',
      'Excavate ground near joint and assess corrosion rate.',
      'Perform high-pressure pipe clamp installation.'
    ];
  } else if (normalizedText.includes('trash') || normalizedText.includes('garbage') || normalizedText.includes('dump') || normalizedText.includes('stench')) {
    suggestedCategory = 'Sanitation & Waste';
    priority = 'Medium';
    reasoning = 'Relates to public cleanliness, organic waste accumulation, and hygienic standard enforcement.';
    department = 'Sanitation & Waste Management';
    safetyRecs = [
      'Keep household food waste sealed in secondary bins to avoid compounding vectors.',
      'Keep pets away from garbage heaps.'
    ];
    officerRecs = [
      'Schedule emergency refuse compaction vehicle.',
      'Deploy localized rodent traps and environmental sanitizers.',
      'Issue warning to local dumpers if illegal commercial waste is spotted.'
    ];
  } else if (normalizedText.includes('pothole') || normalizedText.includes('road') || normalizedText.includes('traffic') || normalizedText.includes('crack') || normalizedText.includes('pave')) {
    suggestedCategory = 'Roads & Traffic';
    priority = normalizedText.includes('school') || normalizedText.includes('crash') || normalizedText.includes('critical') ? 'Critical' : 'Low';
    reasoning = 'Pertains to vehicle suspension risk and minor pedestrian hazards. School zone reference triggers automated hazard elevation to Critical.';
    department = 'Department of Public Works';
    safetyRecs = [
      'Exercise high vigilance in wet conditions when deep road crevices become filled with water.',
      'Do not swerve into incoming lanes to avoid potholes.'
    ];
    officerRecs = [
      'Dispatch asphalt filling crew to site.',
      'Compact sub-base thoroughly before applying standard top coat asphalt.',
      'Verify signage visibility to slow down traffic.'
    ];
  } else if (normalizedText.includes('light') || normalizedText.includes('electricity') || normalizedText.includes('blackout') || normalizedText.includes('dark') || normalizedText.includes('wire')) {
    suggestedCategory = 'Streetlights & Electricity';
    priority = normalizedText.includes('live wire') || normalizedText.includes('spark') ? 'Critical' : 'High';
    reasoning = 'Concerns grid infrastructure breakdown or darkness causing security/visibility risks to general public and motorists.';
    department = 'Grid & Lighting Directorate';
    safetyRecs = [
      'Never touch dangling utility lines or metal posts during blackouts.',
      'Travel in groups on well-lit alternative streets where possible.'
    ];
    officerRecs = [
      'Inspect neighborhood light sensors and control timers.',
      'Replace burnt HPS bulbs with smart low-energy LED units.',
      'Verify supply transformer output stability.'
    ];
  } else if (normalizedText.includes('security') || normalizedText.includes('crime') || normalizedText.includes('theft') || normalizedText.includes('safe')) {
    suggestedCategory = 'Public Safety';
    priority = 'High';
    reasoning = 'Involves citizen safety, physical protection, and law-abiding community security patterns.';
    department = 'Community Police & Safety Patrols';
    safetyRecs = [
      'Lock all doors and windows; report any immediate threats directly to the police hotlines.',
      'Avoid walking unescorted after dark.'
    ];
    officerRecs = [
      'Increase community patrol presence in indicated blocks.',
      'Install motion-activated warning signs or security surveillance.',
      'Co-ordinate with municipal lighting division.'
    ];
  } else if (normalizedText.includes('health') || normalizedText.includes('disease') || normalizedText.includes('pollution') || normalizedText.includes('sewer')) {
    suggestedCategory = 'Public Health';
    priority = 'High';
    reasoning = 'Constitutes a high biological threat or chemical contaminant exposure hazard to nearby citizens.';
    department = 'Health Services & Inspectorate';
    safetyRecs = [
      'Avoid proximity to exposed blackwater or stagnant sludge.',
      'Wash hands thoroughly if direct airborne particles are encountered.'
    ];
    officerRecs = [
      'Take sample for rapid microbiological contamination analysis.',
      'Deploy biological neutralizing sprays immediately.',
      'Liaise with sewage plant supervisor regarding joint lines.'
    ];
  }

  return {
    aiPriority: priority,
    aiPriorityReasoning: reasoning,
    aiCategorySuggested: suggestedCategory,
    aiSafetyRecommendations: safetyRecs,
    aiOfficerRecommendations: officerRecs,
    aiAssignedDepartment: department
  };
}

// REST API ENDPOINTS

// 1. Get all complaints with filters
app.get('/api/complaints', (req, res) => {
  const { category, status, priority, ward, q } = req.query;
  let filtered = [...complaints];
  
  if (category) {
    filtered = filtered.filter(c => c.category === category);
  }
  if (status) {
    filtered = filtered.filter(c => c.status === status);
  }
  if (priority) {
    filtered = filtered.filter(c => c.aiPriority === priority);
  }
  if (ward) {
    filtered = filtered.filter(c => c.ward === ward);
  }
  if (q) {
    const searchStr = (q as string).toLowerCase();
    filtered = filtered.filter(c => 
      c.title.toLowerCase().includes(searchStr) || 
      c.description.toLowerCase().includes(searchStr)
    );
  }
  
  // Sort: pending & urgent first, otherwise newest first
  filtered.sort((a, b) => {
    const priorityWeight = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    const pA = priorityWeight[a.aiPriority] || 0;
    const pB = priorityWeight[b.aiPriority] || 0;
    
    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
    if (b.status === 'Pending' && a.status !== 'Pending') return 1;
    
    if (pA !== pB) return pB - pA;
    
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  
  res.json(filtered);
});

// 2. Submit a new complaint (enriched via Gemini)
app.post('/api/complaints', async (req, res) => {
  const { title, description, category, latitude, longitude, ward, contactName, contactEmail, imageData } = req.body;
  
  if (!title || !description || !contactName || !contactEmail) {
    return res.status(400).json({ error: 'Missing required parameters: title, description, contactName, contactEmail are mandatory.' });
  }
  
  const id = 'comp-' + Math.floor(100000 + Math.random() * 900000);
  const userLat = Number(latitude) || 37.7749 + (Math.random() - 0.5) * 0.05;
  const userLng = Number(longitude) || -122.4194 + (Math.random() - 0.5) * 0.05;
  const defaultWard = ward || 'Ward ' + Math.floor(1 + Math.random() * 12);
  
  const ai = getGeminiClient();
  let aiAnalysis: any = null;
  let isSimulated = false;
  
  if (ai) {
    try {
      const prompt = `
      You are the AI Intelligence Module of "AI Smart Constituency Connect".
      Analyze this user-submitted civic grievance.
      
      User-Selected Category: ${category || 'Other'}
      Title: "${title}"
      Description: "${description}"
      
      Output a valid JSON object matching this schema exactly:
      {
        "aiPriority": "Critical" | "High" | "Medium" | "Low",
        "aiPriorityReasoning": "A 2-3 sentence explanation justifying this severity level",
        "aiCategorySuggested": "Roads & Traffic" | "Sanitation & Waste" | "Water Supply" | "Streetlights & Electricity" | "Public Safety" | "Public Health" | "Other",
        "aiSafetyRecommendations": ["First short safety tip", "Second short safety tip"],
        "aiOfficerRecommendations": ["First operational step for resolution", "Second step", "Third step"],
        "aiAssignedDepartment": "Specific department name responsible"
      }
      
      Rules for evaluation:
      - Assign "Critical" if there is an immediate physical risk of death or severe injury, threats adjacent to schools/parks, or active raw electrical grids.
      - Assign "High" for resource wastage, severe street dark blocks, or main road blocks.
      - Assign "Medium" for rotten waste dumps, minor road crevices, or general clean water leaks.
      - Assign "Low" for aesthetics, non-obstructive cracks, or non-hazardous maintenance requests.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiPriority: { type: Type.STRING },
              aiPriorityReasoning: { type: Type.STRING },
              aiCategorySuggested: { type: Type.STRING },
              aiSafetyRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              aiOfficerRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              aiAssignedDepartment: { type: Type.STRING }
            },
            required: ['aiPriority', 'aiPriorityReasoning', 'aiCategorySuggested', 'aiSafetyRecommendations', 'aiOfficerRecommendations', 'aiAssignedDepartment']
          }
        }
      });
      
      if (response && response.text) {
        aiAnalysis = JSON.parse(response.text.trim());
      }
    } catch (err) {
      console.error('Gemini processing failed, falling back to simulation:', err);
      aiAnalysis = simulateGeminiAnalysis(title, description, category);
      isSimulated = true;
    }
  } else {
    aiAnalysis = simulateGeminiAnalysis(title, description, category);
    isSimulated = true;
  }
  
  // Create final complaint document
  const newComplaint: Complaint = {
    id,
    title,
    description,
    category: aiAnalysis.aiCategorySuggested || category || 'Other',
    latitude: userLat,
    longitude: userLng,
    contactName,
    contactEmail,
    imageData: imageData || null,
    upvotes: 0,
    votedUserEmails: [],
    status: 'Pending',
    ward: defaultWard,
    createdAt: new Date().toISOString(),
    
    // AI Enrichments
    aiPriority: aiAnalysis.aiPriority || 'Medium',
    aiPriorityReasoning: aiAnalysis.aiPriorityReasoning || 'Default AI evaluation.',
    aiCategorySuggested: aiAnalysis.aiCategorySuggested || category || 'Other',
    aiSafetyRecommendations: aiAnalysis.aiSafetyRecommendations || [],
    aiOfficerRecommendations: aiAnalysis.aiOfficerRecommendations || [],
    aiAssignedDepartment: aiAnalysis.aiAssignedDepartment || 'General Public Works',
    
    comments: [],
    logs: [
      {
        id: 'log-' + Math.floor(100000 + Math.random() * 900000),
        title: 'Complaint Logged',
        description: `Citizen ${contactName} filed grievance via Constituency Connect.`,
        timestamp: new Date().toISOString(),
        authorName: contactName
      },
      {
        id: 'log-' + Math.floor(100000 + Math.random() * 900000),
        title: 'AI Smart Analysis Completed',
        description: `Auto-assigned priority to ${aiAnalysis.aiPriority || 'Medium'} under category ${aiAnalysis.aiCategorySuggested || 'Other'}. Department routed: ${aiAnalysis.aiAssignedDepartment || 'General Public Works'}.${isSimulated ? ' (Simulated fallback)' : ''}`,
        timestamp: new Date().toISOString(),
        authorName: 'AI Engine'
      }
    ]
  };
  
  complaints.unshift(newComplaint);
  res.status(201).json(newComplaint);
});

// 3. Upvote/Validate complaint
app.post('/api/complaints/:id/upvote', (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'User email is required to validate complaint.' });
  }
  
  const comp = complaints.find(c => c.id === id);
  if (!comp) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }
  
  const index = comp.votedUserEmails.indexOf(email);
  if (index === -1) {
    comp.votedUserEmails.push(email);
    comp.upvotes += 1;
    comp.logs.push({
      id: 'log-' + Math.floor(100000 + Math.random() * 900000),
      title: 'Community Validation Received',
      description: `Citizen (${email}) verified that they are also affected by this grievance. Total upvotes: ${comp.upvotes}.`,
      timestamp: new Date().toISOString(),
      authorName: 'System'
    });
    res.json({ upvoted: true, upvotes: comp.upvotes });
  } else {
    comp.votedUserEmails.splice(index, 1);
    comp.upvotes = Math.max(0, comp.upvotes - 1);
    res.json({ upvoted: false, upvotes: comp.upvotes });
  }
});

// 4. Comment on a complaint (Citizens or Officers)
app.post('/api/complaints/:id/comment', (req, res) => {
  const { id } = req.params;
  const { authorName, text, isInternal } = req.body;
  
  if (!authorName || !text) {
    return res.status(400).json({ error: 'Missing authorName or text' });
  }
  
  const comp = complaints.find(c => c.id === id);
  if (!comp) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }
  
  const newComment: Comment = {
    id: 'comm-' + Math.floor(100000 + Math.random() * 900000),
    authorName,
    text,
    timestamp: new Date().toISOString(),
    isInternal: !!isInternal
  };
  
  comp.comments.push(newComment);
  comp.logs.push({
    id: 'log-' + Math.floor(100000 + Math.random() * 900000),
    title: isInternal ? 'Internal Note Added' : 'Public Comment Published',
    description: `Comment posted by ${authorName}.`,
    timestamp: new Date().toISOString(),
    authorName
  });
  
  res.status(201).json(newComment);
});

// 5. Update complaint status / Admin action
app.post('/api/complaints/:id/action', (req, res) => {
  const { id } = req.params;
  const { status, officerName, commentText, assignedDepartment } = req.body;
  
  const comp = complaints.find(c => c.id === id);
  if (!comp) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }
  
  if (status) {
    const oldStatus = comp.status;
    comp.status = status as ComplaintStatus;
    comp.logs.push({
      id: 'log-' + Math.floor(100000 + Math.random() * 900000),
      title: `Status Changed to ${status}`,
      description: `Grievance status modified from "${oldStatus}" to "${status}" by Officer ${officerName || 'Administrator'}.`,
      timestamp: new Date().toISOString(),
      authorName: officerName || 'Administrator'
    });
  }
  
  if (assignedDepartment) {
    const oldDept = comp.aiAssignedDepartment;
    comp.aiAssignedDepartment = assignedDepartment;
    comp.logs.push({
      id: 'log-' + Math.floor(100000 + Math.random() * 900000),
      title: 'Department Re-assigned',
      description: `Re-allocated from "${oldDept}" to "${assignedDepartment}" by ${officerName || 'Administrator'}.`,
      timestamp: new Date().toISOString(),
      authorName: officerName || 'Administrator'
    });
  }
  
  if (commentText && officerName) {
    comp.comments.push({
      id: 'comm-' + Math.floor(100000 + Math.random() * 900000),
      authorName: officerName,
      text: commentText,
      timestamp: new Date().toISOString(),
      isInternal: true
    });
  }
  
  res.json(comp);
});

// 6. Detect Duplicates via Gemini
app.post('/api/complaints/:id/detect-duplicates', async (req, res) => {
  const { id } = req.params;
  
  const current = complaints.find(c => c.id === id);
  if (!current) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }
  
  // Collect other complaints that have similar categories or proximity
  const comparisonCandidates = complaints.filter(c => c.id !== id && c.status !== 'Resolved');
  if (comparisonCandidates.length === 0) {
    return res.json({ isDuplicate: false, duplicateOfId: null, similarityPercentage: 0, reasoning: 'No other active complaints exist to compare.' });
  }
  
  const ai = getGeminiClient();
  if (ai) {
    try {
      const candidatesString = comparisonCandidates.map(c => 
        `[ID: ${c.id}] Title: "${c.title}", Description: "${c.description}", Category: "${c.category}", Ward: "${c.ward}"`
      ).join('\n\n');
      
      const prompt = `
      You are the Duplicate Grievance Detector for "AI Smart Constituency Connect".
      Compare this target complaint against other active issues to detect duplicates.
      Two issues are duplicates if they report the exact same localized incident (e.g. the same broken water main, same blackout street stretch, same trash pile).
      
      Target Complaint to Evaluate:
      Title: "${current.title}"
      Description: "${current.description}"
      Category: "${current.category}"
      Ward: "${current.ward}"
      
      Candidates in the system:
      ${candidatesString}
      
      Return a JSON object exactly matching this schema:
      {
        "isDuplicate": boolean,
        "duplicateOfId": "ID of duplicate candidate" | null,
        "similarityPercentage": number (0 to 100),
        "reasoning": "A short explanation comparing the target to the matching candidate, describing why they are duplicates or why they are distinct."
      }
      
      Ensure duplicateOfId matches an ID from the Candidates list if isDuplicate is true.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isDuplicate: { type: Type.BOOLEAN },
              duplicateOfId: { type: Type.STRING },
              similarityPercentage: { type: Type.NUMBER },
              reasoning: { type: Type.STRING }
            },
            required: ['isDuplicate', 'similarityPercentage', 'reasoning']
          }
        }
      });
      
      if (response && response.text) {
        const result = JSON.parse(response.text.trim());
        if (result.isDuplicate && result.duplicateOfId) {
          current.duplicateOfId = result.duplicateOfId;
          current.logs.push({
            id: 'log-' + Math.floor(100000 + Math.random() * 900000),
            title: 'AI Duplicate Warning Flagged',
            description: `AI flagged this grievance as a probable duplicate of ${result.duplicateOfId} with ${result.similarityPercentage}% confidence.`,
            timestamp: new Date().toISOString(),
            authorName: 'AI Engine'
          });
        }
        return res.json(result);
      }
    } catch (err) {
      console.error('Gemini duplicate detection failed:', err);
    }
  }
  
  // Local fallback heuristic comparison
  let match: Complaint | null = null;
  let maxScore = 0;
  
  for (const candidate of comparisonCandidates) {
    let score = 0;
    if (candidate.category === current.category) score += 30;
    if (candidate.ward === current.ward) score += 20;
    
    // Check keyword overlaps
    const w1 = current.title.toLowerCase().split(/\s+/);
    const w2 = candidate.title.toLowerCase().split(/\s+/);
    const common = w1.filter(w => w.length > 3 && w2.includes(w));
    score += common.length * 15;
    
    if (score > maxScore) {
      maxScore = score;
      match = candidate;
    }
  }
  
  if (maxScore > 50 && match) {
    const similarity = Math.min(95, maxScore);
    const reasoning = `Simulated Fallback Detection: Flagged due to shared category "${current.category}" in the same administrative area ("${current.ward}") and overlapping structural terminology in titles.`;
    current.duplicateOfId = match.id;
    return res.json({
      isDuplicate: similarity > 70,
      duplicateOfId: similarity > 70 ? match.id : null,
      similarityPercentage: similarity,
      reasoning
    });
  }
  
  res.json({
    isDuplicate: false,
    duplicateOfId: null,
    similarityPercentage: 0,
    reasoning: 'Simulated fallback evaluation confirms no matching high-severity duplicate candidates.'
  });
});

// 7. Get Analytics Summary
app.get('/api/analytics', (req, res) => {
  const total = complaints.length;
  const resolved = complaints.filter(c => c.status === 'Resolved').length;
  const inProgress = complaints.filter(c => c.status === 'In Progress').length;
  const pending = complaints.filter(c => c.status === 'Pending' || c.status === 'Under Review').length;
  
  // Category counts
  const categories: Record<Category, number> = {
    'Roads & Traffic': 0,
    'Sanitation & Waste': 0,
    'Water Supply': 0,
    'Streetlights & Electricity': 0,
    'Public Safety': 0,
    'Public Health': 0,
    'Other': 0
  };
  
  // Priority counts
  const priorities: Record<PriorityLevel, number> = {
    'Critical': 0,
    'High': 0,
    'Medium': 0,
    'Low': 0
  };
  
  // Status counts
  const statuses: Record<ComplaintStatus, number> = {
    'Pending': 0,
    'Under Review': 0,
    'In Progress': 0,
    'Resolved': 0
  };
  
  // Ward distribution
  const wardData: Record<string, { total: number; resolved: number }> = {};
  
  complaints.forEach(c => {
    if (categories[c.category] !== undefined) categories[c.category]++;
    if (priorities[c.aiPriority] !== undefined) priorities[c.aiPriority]++;
    if (statuses[c.status] !== undefined) statuses[c.status]++;
    
    if (!wardData[c.ward]) {
      wardData[c.ward] = { total: 0, resolved: 0 };
    }
    wardData[c.ward].total++;
    if (c.status === 'Resolved') {
      wardData[c.ward].resolved++;
    }
  });
  
  const analytics: AnalyticsSummary = {
    totalComplaints: total,
    resolvedComplaints: resolved,
    inProgressComplaints: inProgress,
    pendingComplaints: pending,
    avgResolutionTimeDays: 2.4, // Static realistic avg for mock/demo
    byCategory: Object.entries(categories).map(([category, count]) => ({ category: category as Category, count })),
    byPriority: Object.entries(priorities).map(([priority, count]) => ({ priority: priority as PriorityLevel, count })),
    byStatus: Object.entries(statuses).map(([status, count]) => ({ status: status as ComplaintStatus, count })),
    byWard: Object.entries(wardData).map(([ward, data]) => ({ ward, total: data.total, resolved: data.resolved }))
  };
  
  res.json(analytics);
});

// 8. Generate Planning intelligence Strategic Report
app.post('/api/reports/generate', async (req, res) => {
  const ai = getGeminiClient();
  
  const systemReviewInput = complaints.map(c => 
    `- Category: ${c.category}, Ward: ${c.ward}, Priority: ${c.aiPriority}, Upvotes: ${c.upvotes}, Status: ${c.status}. Title: "${c.title}"`
  ).join('\n');
  
  if (ai) {
    try {
      const prompt = `
      You are the Lead Google Cloud Solutions Architect and Chief Urban Planning Data Engineer.
      Review these constituency grievances:
      ${systemReviewInput}
      
      Using Google Cloud Vertex AI / Gemini insights, generate a strategic planning report to optimize public spending, municipal staff allocations, and identify hotbeds of structural hazards.
      
      Your output must be a valid JSON matching this schema exactly:
      {
        "executiveSummary": "A high-level scannable 3-4 sentence diagnostic of the constituency's health. Focus on areas that have many upvotes or high critical issues.",
        "budgetAllocations": [
          { "department": "Public Works (Roads)", "allocationPercentage": 35, "justification": "Detailed data-driven reason based on complaints logged" },
          { "department": "Water Services", "allocationPercentage": 25, "justification": "Reason..." },
          { "department": "Sanitation & Environment", "allocationPercentage": 20, "justification": "Reason..." },
          { "department": "Energy & Grid Services", "allocationPercentage": 20, "justification": "Reason..." }
        ],
        "criticalHotspots": [
          { "location": "Ward Name", "issueCount": 3, "primaryConcern": "The main theme of grievances there" }
        ],
        "strategicRecommendations": [
          "First long-term recommendation",
          "Second long-term recommendation",
          "Third long-term recommendation"
        ],
        "rawAnalysisText": "A fully cohesive analytical summary (around 150 words) on how Google Cloud AI combined with maps databases can streamline municipal response loops."
      }
      
      Budget allocations MUST sum up exactly to 100%. Keep the department list to these 4 or similar.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              budgetAllocations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    department: { type: Type.STRING },
                    allocationPercentage: { type: Type.NUMBER },
                    justification: { type: Type.STRING }
                  },
                  required: ['department', 'allocationPercentage', 'justification']
                }
              },
              criticalHotspots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    location: { type: Type.STRING },
                    issueCount: { type: Type.NUMBER },
                    primaryConcern: { type: Type.STRING }
                  },
                  required: ['location', 'issueCount', 'primaryConcern']
                }
              },
              strategicRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              rawAnalysisText: { type: Type.STRING }
            },
            required: ['executiveSummary', 'budgetAllocations', 'criticalHotspots', 'strategicRecommendations', 'rawAnalysisText']
          }
        }
      });
      
      if (response && response.text) {
        const report = JSON.parse(response.text.trim());
        const finalReport: PlanningReport = {
          id: 'rep-' + Math.floor(100000 + Math.random() * 900000),
          generatedAt: new Date().toISOString(),
          ...report
        };
        return res.json(finalReport);
      }
    } catch (err) {
      console.error('Gemini Report generation failed:', err);
    }
  }
  
  // Fallback simulator for report
  const fallbackReport: PlanningReport = {
    id: 'rep-fallback',
    generatedAt: new Date().toISOString(),
    executiveSummary: 'Simulated Fallback Diagnostic: The constituency exhibits high infrastructure strain in "Ward 7 - Riverside" due to Critical roads damage and large Water Supply issues with significant citizen upvote counts. Energy blackouts in "Ward 12" also represent a rising public safety risk.',
    budgetAllocations: [
      { department: 'Public Works (Roads)', allocationPercentage: 40, justification: 'School zone safety hazards and multiple pothole injury records require substantial paving capital.' },
      { department: 'Water Services & Pipeline Integrity', allocationPercentage: 30, justification: 'Massive pipeline flooding wastes resources and causes drops in residential pipeline pressures.' },
      { department: 'Energy & Grid Restoration', allocationPercentage: 15, justification: 'Darkened Maple Boulevard stretches demand complete LED lighting overhauls.' },
      { department: 'Sanitation & Environment Services', allocationPercentage: 15, justification: 'Central Market refuse overflows present severe biohazard conditions adjacent to local food stalls.' }
    ],
    criticalHotspots: [
      { location: 'Ward 7 - Riverside', issueCount: 2, primaryConcern: 'Vulnerable school-zone road crevices and flooding.' },
      { location: 'Ward 8 - High Street', issueCount: 1, primaryConcern: 'Rotting central market waste and local food health hazards.' }
    ],
    strategicRecommendations: [
      'Transition Ward 7 zones to preemptive predictive pipeline leak diagnostics utilizing pressure sensors.',
      'Establish a strict 24-hour response SLA for any school-adjacent physical hazard reported.',
      'Deploy smart LED street lighting networks that report operational outages automatically to Grid dispatch.'
    ],
    rawAnalysisText: 'This analytics summary was generated using the local safety fallback simulator. Integrating Vertex AI can automate parsing of incoming pictures to cross-reference with historic geographical data, enabling fully automated department assignment and immediate safety recommendation loops to citizens.'
  };
  
  res.json(fallbackReport);
});

// START DEV SERVER OR SERVE PRODUCTION BUILD

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    
    // Serve Vite assets
    app.use(vite.middlewares);
  } else {
    // Production builds
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AI Smart Constituency Connect server is running at http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
  });
}

export default app;
