const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cron = require('node-cron');
const { OpenAI } = require('openai');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Global AI Config (Can be updated via API)
let aiConfig = {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    embeddingModel: 'text-embedding-3-small'
};

let openai = null;
if (aiConfig.apiKey) {
    openai = new OpenAI({ apiKey: aiConfig.apiKey, baseURL: aiConfig.baseURL });
}

// Database setup
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            title TEXT,
            content TEXT,
            category TEXT DEFAULT '未分类',
            importance INTEGER DEFAULT 5,
            timestamp INTEGER,
            is_merged INTEGER DEFAULT 0,
            embedding TEXT
        )`);
    }
});

// Helper: Calculate Cosine Similarity
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Calculate String Overlap (Jaccard-like)
function calculateOverlap(str1, str2) {
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

// Helper: Get Embedding
async function getEmbedding(text) {
    if (!openai) return null;
    try {
        const response = await openai.embeddings.create({
            model: aiConfig.embeddingModel,
            input: text,
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('Embedding error:', error);
        return null;
    }
}

// --- API Routes ---

// Sync API for localStorage persistence
const dataFilePath = path.join(__dirname, 'user_data.json');

app.post('/api/sync', (req, res) => {
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(req.body), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sync', (req, res) => {
    try {
        if (fs.existsSync(dataFilePath)) {
            const data = fs.readFileSync(dataFilePath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update AI Config
app.post('/api/config', (req, res) => {
    aiConfig = { ...aiConfig, ...req.body };
    if (aiConfig.apiKey) {
        openai = new OpenAI({ apiKey: aiConfig.apiKey, baseURL: aiConfig.baseURL });
    }
    res.json({ message: 'Config updated successfully' });
});

// Get all memories (Admin Panel)
app.get('/api/memories', (req, res) => {
    const { search, category, is_merged } = req.query;
    let query = 'SELECT id, title, content, category, importance, timestamp, is_merged FROM memories WHERE 1=1';
    let params = [];

    if (search) {
        query += ' AND (title LIKE ? OR content LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
        query += ' AND category = ?';
        params.push(category);
    }
    if (is_merged !== undefined) {
        query += ' AND is_merged = ?';
        params.push(is_merged);
    }

    query += ' ORDER BY timestamp DESC';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add or Update Memory
app.post('/api/memories', async (req, res) => {
    const { id, title, content, category, importance, timestamp, is_merged } = req.body;
    const memId = id || Date.now().toString();
    const memTimestamp = timestamp || Date.now();
    const memImportance = importance || 5;
    const memCategory = category || '未分类';
    const memIsMerged = is_merged || 0;

    // Generate Embedding (Title + Content)
    const textToEmbed = `标题: ${title || '无'}\n内容: ${content}`;
    const embeddingArray = await getEmbedding(textToEmbed);
    const embeddingStr = embeddingArray ? JSON.stringify(embeddingArray) : null;

    // Deduplication Check (Only for new memories)
    if (!id) {
        const existingMemories = await new Promise((resolve, reject) => {
            db.all('SELECT content FROM memories WHERE is_merged = 0', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        for (let mem of existingMemories) {
            // 1. Exact match
            if (mem.content === content) return res.json({ message: 'Duplicate memory (Exact)', id: memId });
            // 2. Inclusion
            if (mem.content.includes(content) || content.includes(mem.content)) return res.json({ message: 'Duplicate memory (Inclusion)', id: memId });
            // 3. Overlap
            if (calculateOverlap(mem.content, content) > 0.8) return res.json({ message: 'Duplicate memory (Overlap)', id: memId });
        }
    }

    db.run(
        `INSERT OR REPLACE INTO memories (id, title, content, category, importance, timestamp, is_merged, embedding) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [memId, title, content, memCategory, memImportance, memTimestamp, memIsMerged, embeddingStr],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: memId, message: 'Memory saved successfully' });
        }
    );
});

// Delete Memory
app.delete('/api/memories/:id', (req, res) => {
    db.run('DELETE FROM memories WHERE id = ?', req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully', changes: this.changes });
    });
});

// Batch Operations
app.post('/api/memories/batch', (req, res) => {
    const { ids, action, payload } = req.body; // action: 'delete', 'update_category', 'update_importance'
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });

    const placeholders = ids.map(() => '?').join(',');
    let query = '';
    let params = [];

    if (action === 'delete') {
        query = `DELETE FROM memories WHERE id IN (${placeholders})`;
        params = ids;
    } else if (action === 'update_category') {
        query = `UPDATE memories SET category = ? WHERE id IN (${placeholders})`;
        params = [payload, ...ids];
    } else if (action === 'update_importance') {
        query = `UPDATE memories SET importance = ? WHERE id IN (${placeholders})`;
        params = [payload, ...ids];
    }

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Batch ${action} successful`, changes: this.changes });
    });
});

// Vector Semantic Search with 3-Weight Sorting
app.post('/api/memory/search', async (req, res) => {
    const { query, topK = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding) return res.status(500).json({ error: 'Failed to generate embedding' });

    db.all('SELECT * FROM memories WHERE is_merged = 0 AND embedding IS NOT NULL', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const now = Date.now();
        const scoredMemories = rows.map(row => {
            const memEmbedding = JSON.parse(row.embedding);
            
            // 1. Semantic Similarity (60%)
            const sim = cosineSimilarity(queryEmbedding, memEmbedding);
            const simScore = Math.max(0, sim) * 0.6;

            // 2. Importance (25%)
            const impScore = (row.importance / 10) * 0.25;

            // 3. Time Freshness (15%) - Decay over 30 days
            const daysDiff = (now - row.timestamp) / (1000 * 60 * 60 * 24);
            const timeScore = Math.exp(-daysDiff / 30) * 0.15;

            const totalScore = simScore + impScore + timeScore;

            return { ...row, score: totalScore, simScore, impScore, timeScore };
        });

        scoredMemories.sort((a, b) => b.score - a.score);
        
        // Remove embedding from response to save bandwidth
        const results = scoredMemories.slice(0, topK).map(m => {
            delete m.embedding;
            return m;
        });

        res.json(results);
    });
});

// AI Auto Extract Memory from Chat
app.post('/api/memory/extract', async (req, res) => {
    const { messages } = req.body; // Array of chat messages
    if (!openai) return res.status(400).json({ error: 'AI not configured' });

    try {
        const prompt = `
        请分析以下对话记录，提取出关于用户或AI的重要记忆碎片（如喜好、事件、约定、情感状态等）。
        如果没有值得记录的信息，请回复 "NONE"。
        如果有，请以 JSON 数组格式返回，每个对象包含：
        - title: 记忆的简短标题
        - content: 记忆的详细内容
        - category: 分类（如：个人喜好、日常事件、情感、约定等）
        - importance: 重要度（1-10的整数）
        
        对话记录：
        ${JSON.stringify(messages)}
        `;

        const response = await openai.chat.completions.create({
            model: aiConfig.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        });

        const resultText = response.choices[0].message.content;
        if (resultText.includes('NONE')) return res.json({ message: 'No memory extracted' });

        const extracted = JSON.parse(resultText);
        const memoriesToSave = extracted.memories || extracted; // Handle different JSON structures

        if (Array.isArray(memoriesToSave)) {
            for (let mem of memoriesToSave) {
                // Call the add memory logic internally
                const textToEmbed = `标题: ${mem.title}\n内容: ${mem.content}`;
                const embeddingArray = await getEmbedding(textToEmbed);
                const embeddingStr = embeddingArray ? JSON.stringify(embeddingArray) : null;

                db.run(
                    `INSERT INTO memories (id, title, content, category, importance, timestamp, is_merged, embedding) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [Date.now().toString() + Math.floor(Math.random()*1000), mem.title, mem.content, mem.category || '未分类', mem.importance || 5, Date.now(), 0, embeddingStr]
                );
            }
        }

        res.json({ message: 'Memories extracted and saved', count: memoriesToSave.length });
    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Daily Auto Merge (Cron Job) ---
// Runs every day at 3:00 AM
cron.schedule('0 3 * * *', async () => {
    console.log('Running daily memory merge task...');
    if (!openai) return console.log('AI not configured, skipping merge.');

    db.all('SELECT * FROM memories WHERE is_merged = 0', [], async (err, rows) => {
        if (err || rows.length < 5) return; // Only merge if there are enough fragments

        try {
            const prompt = `
            请将以下零碎的记忆片段按主题或事件进行整理和合并，生成几条完整的、结构化的综合记忆。
            请以 JSON 数组格式返回，每个对象包含：
            - title: 综合记忆标题
            - content: 详细的综合内容
            - category: 分类
            - importance: 综合重要度（1-10）
            
            记忆碎片：
            ${JSON.stringify(rows.map(r => ({ title: r.title, content: r.content, date: new Date(r.timestamp).toLocaleDateString() })))}
            `;

            const response = await openai.chat.completions.create({
                model: aiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: "json_object" }
            });

            const resultText = response.choices[0].message.content;
            const extracted = JSON.parse(resultText);
            const mergedMemories = extracted.memories || extracted;

            if (Array.isArray(mergedMemories)) {
                // 1. Save new merged memories
                for (let mem of mergedMemories) {
                    const textToEmbed = `标题: ${mem.title}\n内容: ${mem.content}`;
                    const embeddingArray = await getEmbedding(textToEmbed);
                    const embeddingStr = embeddingArray ? JSON.stringify(embeddingArray) : null;

                    db.run(
                        `INSERT INTO memories (id, title, content, category, importance, timestamp, is_merged, embedding) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [Date.now().toString() + Math.floor(Math.random()*1000), mem.title, mem.content, mem.category || '综合整理', mem.importance || 7, Date.now(), 0, embeddingStr]
                    );
                }

                // 2. Mark old memories as merged
                const oldIds = rows.map(r => r.id);
                const placeholders = oldIds.map(() => '?').join(',');
                db.run(`UPDATE memories SET is_merged = 1 WHERE id IN (${placeholders})`, oldIds);
                
                console.log(`Successfully merged ${oldIds.length} fragments into ${mergedMemories.length} comprehensive memories.`);
            }
        } catch (error) {
            console.error('Merge task error:', error);
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
