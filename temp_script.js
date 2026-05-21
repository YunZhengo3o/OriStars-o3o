
    // --- Global State ---
    let chatHistory = [];
    let isOnlineMode = true;
    let activeBubbleIndex = -1;
    let activeBubbleRole = '';
    let isAppInitialized = false;

    function getSettings() {
        return {
            apiUrl: localStorage.getItem('os_apiUrl') || '', apiKey: localStorage.getItem('os_apiKey') || '',
            apiModel: localStorage.getItem('os_apiModel') || 'gpt-3.5-turbo', temperature: localStorage.getItem('os_temperature') || '0.7',
            autoExtractThreshold: localStorage.getItem('os_autoExtractThreshold') || '6',
            charName: localStorage.getItem('os_charName') || '恶犬', charPersona: localStorage.getItem('os_charPersona') || '你是一只温柔治愈的恶犬，是主人的专属陪伴。',
            userPersona: localStorage.getItem('os_userPersona') || '我是你的主人。', chatBg: localStorage.getItem('os_chatBg') || '', desktopBg: localStorage.getItem('os_desktopBg') || '',
            charAvatar: localStorage.getItem('os_charAvatar') || '', userAvatar: localStorage.getItem('os_userAvatar') || '',
            bubbleUserBg: localStorage.getItem('os_bubbleUserBg') || '#007AFF', bubbleUserColor: localStorage.getItem('os_bubbleUserColor') || '#FFFFFF',
            bubbleAiBg: localStorage.getItem('os_bubbleAiBg') || 'rgba(255, 255, 255, 0.25)', bubbleAiColor: localStorage.getItem('os_bubbleAiColor') || '#FFFFFF',
            showFab: localStorage.getItem('os_showFab') !== 'false'
        };
    }

    // --- View Switching ---
    function switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        
        if (viewId === 'memory') {
            document.getElementById('view-memory-splash').classList.add('active');
            generateAIContent('请生成一句简短的、充满诗意和回忆感的句子（20字以内），不要加引号。', 'memory-splash-text');
        } else {
            document.getElementById('view-' + viewId).classList.add('active');
            if(document.getElementById('nav-' + viewId)) document.getElementById('nav-' + viewId).classList.add('active');
        }

        if (viewId === 'chat') {
            document.getElementById('view-messages').classList.add('active');
            document.getElementById('view-chat').classList.remove('active');
            document.getElementById('main-dock').style.display = 'flex';
            updateContactPreview();
        } else {
            document.getElementById('main-dock').style.display = 'flex';
        }

        if (viewId === 'schedule') renderCalendar();
    }

    function openMainChat() {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-chat').classList.add('active');
        document.getElementById('main-dock').style.display = 'none';
        scrollToBottom();
    }

    function closeMainChat() {
        document.getElementById('view-chat').classList.remove('active');
        document.getElementById('view-messages').classList.add('active');
        document.getElementById('main-dock').style.display = 'flex';
        updateContactPreview();
    }

    function updateContactPreview() {
        const s = getSettings();
        document.getElementById('contact-name').textContent = s.charName;
        if (s.charAvatar) document.getElementById('contact-avatar').src = s.charAvatar;
        if (chatHistory.length > 0) {
            const lastMsg = chatHistory[chatHistory.length - 1];
            const temp = document.createElement('div'); temp.innerHTML = lastMsg.content;
            document.getElementById('contact-last-msg').textContent = temp.textContent || temp.innerText || "[图片/文件]";
            
            const now = new Date();
            const msgDate = new Date(lastMsg.timestamp);
            if (now.toDateString() === msgDate.toDateString()) {
                document.getElementById('contact-time').textContent = `${String(msgDate.getHours()).padStart(2, '0')}:${String(msgDate.getMinutes()).padStart(2, '0')}`;
            } else {
                document.getElementById('contact-time').textContent = `${msgDate.getMonth() + 1}/${msgDate.getDate()}`;
            }
        }
    }

    // --- Home Swiper & Drag ---
    function updatePageDots() {
        const swiper = document.getElementById('home-swiper');
        const index = Math.round(swiper.scrollLeft / swiper.offsetWidth);
        const dots = document.querySelectorAll('#home-page-dots .page-dot');
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    }

    // Init SortableJS for drag and drop
    document.addEventListener('DOMContentLoaded', () => {
        new Sortable(document.getElementById('grid-container-1'), { group: 'shared', animation: 150, delay: 200, delayOnTouchOnly: true });
        new Sortable(document.getElementById('grid-container-2'), { group: 'shared', animation: 150, delay: 200, delayOnTouchOnly: true });
        new Sortable(document.getElementById('widget-container'), { animation: 150, delay: 200, delayOnTouchOnly: true });
    });

    // --- Internal Apps ---
    function openInternalApp(appId) {
        const app = document.getElementById(appId);
        app.style.display = 'flex';
        setTimeout(() => app.classList.add('show'), 10);
    }
    function closeInternalApp(appId) {
        const app = document.getElementById(appId);
        app.classList.remove('show');
        setTimeout(() => app.style.display = 'none', 300);
    }

    // --- Memory System V6 (Backend Integration with Vector Search) ---
    const MemorySystem = {
        async getMemories() {
            try {
                const res = await fetch('http://localhost:3000/api/memories');
                return await res.json();
            } catch (e) {
                console.error("Failed to fetch memories", e);
                return [];
            }
        },
        async getGraph() {
            const memories = await this.getMemories();
            return {
                nodes: memories.map(r => ({
                    id: r.id,
                    subject_key: r.title,
                    content: r.content,
                    importance: r.importance,
                    write_time: r.timestamp,
                    is_merged: r.is_merged
                })),
                edges: []
            };
        },
        
        async addMemory(title, content, importance, type = 'fragment') {
            try {
                const res = await fetch('http://localhost:3000/api/memories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content, importance: parseInt(importance) || 5 })
                });
                const data = await res.json();
                if (data.message && data.message.includes('Duplicate')) {
                    console.log("Duplicate memory ignored:", data.message);
                    return false;
                }
                await loadMemoryData();
                return true;
            } catch (e) {
                console.error("Failed to add memory", e);
                return false;
            }
        },
        
        async search(query) {
            if (!query) return await this.getMemories();
            try {
                const res = await fetch('http://localhost:3000/api/memory/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, topK: 5 })
                });
                const results = await res.json();
                return results.map(m => ({
                    id: m.id,
                    subject_key: m.title,
                    content: m.content,
                    importance: m.importance,
                    write_time: m.timestamp,
                    score: m.score
                }));
            } catch (e) {
                console.error("Search failed", e);
                return [];
            }
        },
        
        async autoExtractFromChat() {
            const recentChat = chatHistory.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
            try {
                await fetch('http://localhost:3000/api/memory/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: recentChat })
                });
            } catch (e) {
                console.error("Auto extract failed", e);
            }
        },
        
        async dailyOrganize(force = false) {
            alert("后端已配置每日凌晨3点自动整理记忆，无需手动操作。");
        }
    };

    // --- Memory Admin Logic ---
    let adminSelectedMemories = new Set();

    async function loadAdminMemories() {
        const list = document.getElementById('mem-admin-list');
        list.innerHTML = '加载中...';
        try {
            const data = await MemorySystem.getMemories();
            renderAdminMemories(data);
        } catch (e) {
            list.innerHTML = '加载失败';
        }
    }

    async function searchAdminMemories() {
        const q = document.getElementById('mem-admin-search').value.trim();
        if (!q) return loadAdminMemories();
        const list = document.getElementById('mem-admin-list');
        list.innerHTML = '搜索中...';
        try {
            const data = await MemorySystem.search(q);
            renderAdminMemories(data);
        } catch (e) {
            list.innerHTML = '搜索失败';
        }
    }

    function renderAdminMemories(data) {
        const list = document.getElementById('mem-admin-list');
        list.innerHTML = '';
        adminSelectedMemories.clear();
        
        if (data.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#8E8E93; padding:20px;">没有记忆</div>';
            return;
        }

        data.forEach(mem => {
            const dateStr = new Date(mem.timestamp || mem.write_time).toLocaleString();
            const isMergedStr = mem.is_merged ? '<span style="color:#FF9500; font-size:0.8em;">[已合并]</span>' : '';
            const scoreStr = mem.score ? `<span style="color:#34C759; font-size:0.8em;">[得分:${mem.score.toFixed(2)}]</span>` : '';
            
            list.innerHTML += `
                <div class="card" style="background:white; padding:12px; border-radius:12px; margin-bottom:0;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" onchange="toggleAdminSelect('${mem.id}', this.checked)">
                            <div style="font-weight:bold; font-size:1.05em;">${mem.title || mem.subject_key || '无题'} ${isMergedStr} ${scoreStr}</div>
                        </div>
                        <div style="font-size:0.8em; color:white; background:#007AFF; padding:2px 6px; border-radius:6px;">重要度: ${mem.importance}</div>
                    </div>
                    <div style="font-size:0.85em; color:#8E8E93; margin-bottom:8px;">${dateStr}</div>
                    <div style="font-size:0.95em; color:#333; white-space:pre-wrap; line-height:1.4;">${mem.content}</div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px; border-top:1px solid #E5E5EA; padding-top:10px;">
                        <button onclick="editAdminMemory('${mem.id}', '${mem.title || mem.subject_key}', '${mem.content.replace(/\n/g, '\\n')}', ${mem.importance})" style="background:none; border:none; color:#007AFF; font-size:0.9em;"><i class="fas fa-edit"></i> 编辑</button>
                        <button onclick="deleteAdminMemory('${mem.id}')" style="background:none; border:none; color:#FF3B30; font-size:0.9em;"><i class="fas fa-trash"></i> 删除</button>
                    </div>
                </div>
            `;
        });
    }

    function toggleAdminSelect(id, checked) {
        if (checked) adminSelectedMemories.add(id);
        else adminSelectedMemories.delete(id);
    }

    async function deleteAdminMemory(id) {
        if (!confirm("确定删除这条记忆吗？")) return;
        try {
            await fetch(`http://localhost:3000/api/memories/${id}`, { method: 'DELETE' });
            loadAdminMemories();
            loadMemoryData();
        } catch (e) { alert("删除失败"); }
    }

    async function batchDeleteMemories() {
        if (adminSelectedMemories.size === 0) return alert("请先选择要删除的记忆");
        if (!confirm(`确定删除选中的 ${adminSelectedMemories.size} 条记忆吗？`)) return;
        try {
            await fetch('http://localhost:3000/api/memories/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(adminSelectedMemories), action: 'delete' })
            });
            loadAdminMemories();
            loadMemoryData();
        } catch (e) { alert("批量删除失败"); }
    }

    async function editAdminMemory(id, oldTitle, oldContent, oldImp) {
        const title = prompt("修改标题：", oldTitle);
        if (title === null) return;
        const content = prompt("修改内容：", oldContent.replace(/\\n/g, '\n'));
        if (content === null) return;
        const imp = prompt("修改重要度(1-10)：", oldImp);
        if (imp === null) return;

        try {
            await fetch('http://localhost:3000/api/memories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, title, content, importance: parseInt(imp) || 5 })
            });
            loadAdminMemories();
            loadMemoryData();
        } catch (e) { alert("修改失败"); }
    }

    // --- Memory UI Logic ---
    let currentMemNodes = [];
    let memCalDate = new Date();

    async function enterMemoryMain() {
        document.getElementById('view-memory-splash').classList.remove('active');
        document.getElementById('view-memory-main').classList.add('active');
        document.getElementById('nav-memory').classList.add('active');
        
        document.getElementById('main-dock').style.display = 'none';
        
        await loadMemoryData();
        switchMemElegantTab('starmap');
    }

    const originalSwitchView = switchView;
    switchView = function(viewId) {
        originalSwitchView(viewId);
        if (viewId !== 'memory' && viewId !== 'chat') {
            document.getElementById('main-dock').style.display = 'flex';
        }
    }

    async function loadMemoryData() {
        const graph = await MemorySystem.getGraph();
        currentMemNodes = graph.nodes.filter(n => !n.is_merged).sort((a, b) => b.write_time - a.write_time);
        
        document.getElementById('mem-count').textContent = currentMemNodes.length;
        
        let totalWords = 0;
        currentMemNodes.forEach(n => totalWords += (n.content || '').length);
        document.getElementById('mem-wordcount').textContent = `${totalWords.toLocaleString()} 字`;
    }

    function switchMemElegantTab(tab) {
        document.querySelectorAll('.mem-elegant-tab').forEach(t => t.style.display = 'none');
        document.querySelectorAll('.mem-nav-item').forEach(n => n.classList.remove('active'));
        
        document.getElementById('mem-tab-' + tab).style.display = 'block';
        const navItem = document.getElementById('nav-mem-' + tab);
        if(navItem) navItem.classList.add('active');
        
        if (tab === 'starmap') renderStarMap();
        if (tab === 'moonphase') renderMoonPhase();
        if (tab === 'calendar') renderMemCalendar();
        if (tab === 'timeline') renderMemTimeline();
    }

    function renderStarMap() {
        const container = document.getElementById('mem-tab-starmap');
        container.innerHTML = '';
        const colors = ['#A0A0A0', '#C0B0A0', '#A0B0C0', '#B0A0C0', '#C0C0A0'];
        
        currentMemNodes.forEach(node => {
            const letter = (node.subject_key || 'M').charAt(0).toUpperCase();
            const el = document.createElement('div');
            el.className = 'star-letter';
            el.textContent = letter;
            el.style.left = (10 + Math.random() * 80) + '%';
            el.style.top = (10 + Math.random() * 80) + '%';
            el.style.color = colors[Math.floor(Math.random() * colors.length)];
            el.style.opacity = 0.5 + Math.random() * 0.5;
            el.style.fontSize = (0.8 + Math.random() * 1.2) + 'em';
            el.onclick = () => openMemDetail(node);
            container.appendChild(el);
        });
    }

    function renderMoonPhase(filterText = '', searchResults = null) {
        const container = document.getElementById('mem-tab-moonphase');
        container.innerHTML = '';
        
        let nodes = currentMemNodes;
        if (searchResults) {
            nodes = searchResults;
        } else if (filterText) {
            nodes = nodes.filter(n => (n.subject_key && n.subject_key.includes(filterText)) || n.content.includes(filterText));
        }

        if (nodes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#A0A0A0;">空空如也</div>';
            return;
        }

        nodes.forEach((node, index) => {
            const dateStr = new Date(node.write_time).toLocaleDateString();
            const rotation = (index * 45) % 360;
            const scoreStr = node.score ? ` · 匹配度: ${(node.score * 100).toFixed(0)}%` : '';
            container.innerHTML += `
                <div class="moon-list-item" onclick='openMemDetailById("${node.id}")'>
                    <div class="moon-icon" style="transform: rotate(${rotation}deg);"></div>
                    <div class="moon-item-content">
                        <div class="moon-item-title">${node.subject_key || '无题'}</div>
                        <div class="moon-item-date">${dateStr} · 重要度: ${node.importance || 5}${scoreStr}</div>
                    </div>
                </div>
            `;
        });
    }

    function changeMemMonth(delta) {
        memCalDate.setMonth(memCalDate.getMonth() + delta);
        renderMemCalendar();
    }

    function renderMemCalendar() {
        const year = memCalDate.getFullYear();
        const month = memCalDate.getMonth();
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        document.getElementById('mem-cal-month-year').textContent = `${monthNames[month]} ${year}`;
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const container = document.getElementById('mem-cal-days');
        container.innerHTML = '';
        
        for (let i = 0; i < firstDay; i++) {
            container.innerHTML += `<div class="mem-cal-day empty"></div>`;
        }
        
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const hasMem = currentMemNodes.some(n => {
                const d = new Date(n.write_time);
                return d.getFullYear() === year && d.getMonth() === month && d.getDate() === i;
            });
            
            const className = hasMem ? 'mem-cal-day has-mem' : 'mem-cal-day';
            container.innerHTML += `<div class="${className}" onclick="filterMemByDate(${year}, ${month}, ${i})">${i}</div>`;
        }
    }

    function filterMemByDate(year, month, day) {
        const nodes = currentMemNodes.filter(n => {
            const d = new Date(n.write_time);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });
        if (nodes.length === 0) {
            alert("这一天没有留下记忆。");
            return;
        }
        switchMemElegantTab('timeline');
        renderMemTimeline(nodes);
    }

    function renderMemTimeline(nodesToRender = null) {
        const container = document.getElementById('mem-timeline-list');
        container.innerHTML = '';
        
        const nodes = nodesToRender || currentMemNodes;
        
        if (nodes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#A0A0A0;">没有足迹</div>';
            return;
        }

        nodes.forEach(node => {
            const dateStr = new Date(node.write_time).toLocaleDateString();
            container.innerHTML += `
                <div class="timeline-item" onclick='openMemDetailById("${node.id}")'>
                    <div class="timeline-title">${node.subject_key || '无题'} —— ${node.content.substring(0, 20)}...</div>
                    <div class="timeline-date">${dateStr}</div>
                </div>
            `;
        });
    }

    function openMemDetailById(id) {
        let node = currentMemNodes.find(n => n.id === id);
        if (!node) {
            fetch(`http://localhost:3000/api/memories`).then(res => res.json()).then(data => {
                const n = data.find(d => d.id === id);
                if (n) openMemDetail({
                    id: n.id,
                    subject_key: n.title,
                    content: n.content,
                    write_time: n.timestamp
                });
            });
        } else {
            openMemDetail(node);
        }
    }

    function openMemDetail(node) {
        document.getElementById('mem-detail-title').textContent = node.subject_key || '无题';
        document.getElementById('mem-detail-date').textContent = new Date(node.write_time).toLocaleString();
        document.getElementById('mem-detail-body').textContent = node.content;
        
        const delBtn = document.getElementById('mem-detail-delete-btn');
        delBtn.onclick = async () => {
            if (confirm("确定要删除这段记忆吗？")) {
                try {
                    const res = await fetch(`/api/memory/graph/${node.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        closeMemDetail();
                        await loadMemoryData();
                        const activeTab = document.querySelector('.mem-nav-item.active');
                        if (activeTab) activeTab.click();
                    }
                } catch (e) { console.error(e); }
            }
        };
        
        document.getElementById('mem-detail-modal').classList.add('show');
    }

    function closeMemDetail() {
        document.getElementById('mem-detail-modal').classList.remove('show');
    }

    async function searchMemoryPrompt() {
        const q = prompt("搜索记忆：");
        if (q) {
            switchMemElegantTab('moonphase');
            const results = await MemorySystem.search(q);
            renderMoonPhase(q, results);
        }
    }

    function openRandomMemory() {
        if (currentMemNodes.length === 0) return alert("还没有记忆哦。");
        const randomNode = currentMemNodes[Math.floor(Math.random() * currentMemNodes.length)];
        openMemDetail(randomNode);
    }

    async function showAddMemoryModal() {
        const title = prompt("记忆标题："); if (!title) return;
        const content = prompt("记忆内容："); if (!content) return;
        const imp = prompt("重要度 (1-10)：", "5");
        const success = await MemorySystem.addMemory(title, content, imp, 'fragment');
        if (success) {
            await loadMemoryData();
            const activeTab = document.querySelector('.mem-nav-item.active');
            if (activeTab) activeTab.click();
            alert("记忆已保存。");
        }
    }

    // --- Chat Logic ---
    function toggleAttachMenu(e) { if(e) e.stopPropagation(); document.getElementById('attachMenu').classList.toggle('show'); }
    function closeMenus() { 
        document.getElementById('attachMenu').classList.remove('show'); 
        document.getElementById('bubbleMenu').classList.remove('show');
    }

    function handleChatUpload(event, type) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                closeMenus();
                if (file.type.startsWith('image/')) {
                    compressImage(e.target.result, 800, (compressed) => {
                        const content = `<img src="${compressed}" class="chat-img-preview">`;
                        chatHistory.push({ role: 'user', content: content, timestamp: Date.now() });
                        saveChatHistory(); renderChatHistory(); requestAIResponse();
                    });
                } else if (file.type.startsWith('video/')) {
                    const content = `<video src="${e.target.result}" class="chat-img-preview" controls></video>`;
                    chatHistory.push({ role: 'user', content: content, timestamp: Date.now() });
                    saveChatHistory(); renderChatHistory(); requestAIResponse();
                } else {
                    const content = `[文件] ${file.name}`;
                    chatHistory.push({ role: 'user', content: content, timestamp: Date.now() });
                    saveChatHistory(); renderChatHistory(); requestAIResponse();
                }
            };
            reader.readAsDataURL(file);
        }
    }
    function sendRealLocation() {
        closeMenus();
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((p) => {
                const lat = p.coords.latitude; const lon = p.coords.longitude;
                chatHistory.push({ role: 'user', content: `[位置分享] 纬度: ${lat.toFixed(4)}, 经度: ${lon.toFixed(4)}`, timestamp: Date.now() });
                saveChatHistory(); renderChatHistory(); requestAIResponse();
            }, () => { alert("无法获取位置信息，请检查权限。"); });
        } else { alert("浏览器不支持定位。"); }
    }

    let isChatSelectMode = false;
    let selectedChatIndices = new Set();

    function toggleChatSelectMode() {
        isChatSelectMode = !isChatSelectMode;
        selectedChatIndices.clear();
        document.getElementById('chat-select-bar').style.display = isChatSelectMode ? 'flex' : 'none';
        document.getElementById('chat-header-select-btn').style.color = isChatSelectMode ? '#007AFF' : 'white';
        renderChatHistory();
    }

    function deleteSelectedChats() {
        if (selectedChatIndices.size === 0) return;
        if (confirm(`确定删除选中的 ${selectedChatIndices.size} 条消息？`)) {
            chatHistory = chatHistory.filter((_, i) => !selectedChatIndices.has(i));
            saveChatHistory(); toggleChatSelectMode();
        }
    }

    function favSelectedChats() {
        if (selectedChatIndices.size === 0) return;
        let favs = JSON.parse(localStorage.getItem('os_favs') || '[]');
        selectedChatIndices.forEach(i => {
            const msg = chatHistory[i];
            const temp = document.createElement('div'); temp.innerHTML = msg.content;
            favs.push({ id: Date.now().toString() + i, content: temp.textContent || temp.innerText || "", timestamp: Date.now() });
        });
        localStorage.setItem('os_favs', JSON.stringify(favs));
        alert(`已收藏 ${selectedChatIndices.size} 条消息！`);
        toggleChatSelectMode();
    }

    function showBubbleMenu(e, index, role) {
        if (isChatSelectMode) {
            e.stopPropagation();
            if (selectedChatIndices.has(index)) selectedChatIndices.delete(index);
            else selectedChatIndices.add(index);
            renderChatHistory();
            return;
        }
        e.stopPropagation();
        closeMenus();
        activeBubbleIndex = index; activeBubbleRole = role;
        const menu = document.getElementById('bubbleMenu');
        menu.classList.add('show');
        
        // Position menu
        let x = e.clientX; let y = e.clientY;
        if (x + 120 > window.innerWidth) x = window.innerWidth - 130;
        if (y + 150 > window.innerHeight) y = window.innerHeight - 160;
        menu.style.left = x + 'px'; menu.style.top = y + 'px';
    }

    function bubbleAction(action) {
        closeMenus();
        if (activeBubbleIndex < 0) return;
        const msg = chatHistory[activeBubbleIndex];
        
        if (action === 'copy') {
            // Strip HTML tags if it's an image
            const temp = document.createElement('div'); temp.innerHTML = msg.content;
            navigator.clipboard.writeText(temp.textContent || temp.innerText || "");
        } else if (action === 'fav') {
            let favs = JSON.parse(localStorage.getItem('os_favs') || '[]');
            const temp = document.createElement('div'); temp.innerHTML = msg.content;
            favs.push({ id: Date.now().toString(), content: temp.textContent || temp.innerText || "", timestamp: Date.now() });
            localStorage.setItem('os_favs', JSON.stringify(favs));
            alert("已收藏到记忆库！");
        } else if (action === 'edit') {
            if (activeBubbleRole === 'user') {
                const temp = document.createElement('div'); temp.innerHTML = msg.content;
                const newText = prompt("编辑您的消息：", temp.textContent || temp.innerText || "");
                if (newText !== null && newText.trim() !== "") {
                    chatHistory = chatHistory.slice(0, activeBubbleIndex);
                    document.getElementById('chatInput').value = newText;
                    toggleSendIcon(); sendMessage();
                }
            } else {
                if (confirm("确定要让 AI 重新生成这条回复吗？")) {
                    chatHistory = chatHistory.slice(0, activeBubbleIndex);
                    saveChatHistory(); renderChatHistory(); requestAIResponse();
                }
            }
        }
    }

    function scrollToBottom() { const body = document.getElementById('chatBody'); body.scrollTop = body.scrollHeight; }

    function appendMessage(role, text, index, isLastInGroup) {
        const body = document.getElementById('chatBody');
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${role} ${selectedChatIndices.has(index) ? 'selected' : ''}`;
        const tailClass = isLastInGroup ? 'has-tail' : '';
        msgDiv.innerHTML = `<div class="bubble ${tailClass}" onclick="showBubbleMenu(event, ${index}, '${role}')">${text}</div>`;
        body.appendChild(msgDiv);
    }

    function showTyping() {
        const body = document.getElementById('chatBody');
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ai typing-msg`;
        msgDiv.innerHTML = `<div class="bubble has-tail"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
        body.appendChild(msgDiv);
        scrollToBottom();
    }
    function removeTyping() { const t = document.querySelector('.typing-msg'); if(t) t.remove(); }

    async function sendMessage() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = ''; input.style.height = 'auto'; toggleSendIcon();
        
        chatHistory.push({ role: 'user', content: text, timestamp: Date.now() });
        saveChatHistory(); renderChatHistory(); renderMiniChatHistory();
        
        await requestAIResponse();
        
        // Auto extract
        const threshold = parseInt(getSettings().autoExtractThreshold) || 6;
        if (chatHistory.length % threshold === 0) MemorySystem.autoExtractFromChat();
    }

    // --- New Internal Apps Logic ---
    function renderDiary() {
        const list = document.getElementById('diary-list'); list.innerHTML = '';
        let data = JSON.parse(localStorage.getItem('os_diaries') || '[]');
        data.sort((a,b) => b.timestamp - a.timestamp).forEach(d => {
            list.innerHTML += `<div class="card"><div style="font-weight:bold; margin-bottom:5px;">${d.title}</div><div style="font-size:0.8em; color:var(--text-sub); margin-bottom:8px;">${new Date(d.timestamp).toLocaleString()}</div><div style="white-space:pre-wrap; font-size:0.9em;">${d.content}</div><button onclick="deleteDiary(${d.timestamp})" style="background:none; border:none; color:#FF3B30; margin-top:10px;"><i class="fas fa-trash"></i> 删除</button></div>`;
        });
    }
    function addDiary() {
        const title = document.getElementById('diary-title').value.trim() || '无题'; const content = document.getElementById('diary-content').value.trim();
        if(!content) return alert("写点什么吧");
        let data = JSON.parse(localStorage.getItem('os_diaries') || '[]');
        data.push({ title, content, timestamp: Date.now() }); localStorage.setItem('os_diaries', JSON.stringify(data));
        document.getElementById('diary-title').value = ''; document.getElementById('diary-content').value = ''; renderDiary();
    }
    function deleteDiary(ts) { let data = JSON.parse(localStorage.getItem('os_diaries') || '[]'); data = data.filter(d => d.timestamp !== ts); localStorage.setItem('os_diaries', JSON.stringify(data)); renderDiary(); }

    // --- Reading App Logic (IndexedDB + TXT Parsing) ---
    const BookDB = {
        db: null,
        async init() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open('OriStars_Books', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('books')) {
                        db.createObjectStore('books', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                req.onerror = (e) => reject(e);
            });
        },
        async saveBook(book) {
            return new Promise((resolve) => {
                const tx = this.db.transaction('books', 'readwrite');
                tx.objectStore('books').put(book);
                tx.oncomplete = () => resolve();
            });
        },
        async getBooks() {
            return new Promise((resolve) => {
                const tx = this.db.transaction('books', 'readonly');
                const req = tx.objectStore('books').getAll();
                req.onsuccess = () => resolve(req.result);
            });
        },
        async getBook(id) {
            return new Promise((resolve) => {
                const tx = this.db.transaction('books', 'readonly');
                const req = tx.objectStore('books').get(id);
                req.onsuccess = () => resolve(req.result);
            });
        },
        async deleteBook(id) {
            return new Promise((resolve) => {
                const tx = this.db.transaction('books', 'readwrite');
                tx.objectStore('books').delete(id);
                tx.oncomplete = () => resolve();
            });
        }
    };

    let currentBookId = localStorage.getItem('os_current_book_id') || null;
    let currentBookData = null;

    async function renderReading() {
        await BookDB.init();
        const books = await BookDB.getBooks();
        
        // Render Shelf
        const shelf = document.getElementById('bookshelf-grid');
        shelf.innerHTML = '';
        books.forEach(b => {
            const progress = ((b.currentChapterIndex / b.chapters.length) * 100).toFixed(1);
            shelf.innerHTML += `
                <div class="book-item" onclick="openBook('${b.id}')">
                    <button class="book-delete-btn" onclick="event.stopPropagation(); deleteBook('${b.id}')"><i class="fas fa-times"></i></button>
                    <div class="book-cover">${b.title}</div>
                    <div class="book-title">${b.title}</div>
                    <div class="book-progress">${progress}%</div>
                </div>
            `;
        });
        
        // Render Now Reading
        const nowTab = document.getElementById('read-tab-now');
        if (currentBookId) {
            currentBookData = await BookDB.getBook(currentBookId);
        } else if (books.length > 0) {
            currentBookData = books[0];
            currentBookId = currentBookData.id;
            localStorage.setItem('os_current_book_id', currentBookId);
        }
        
        if (currentBookData) {
            const progress = ((currentBookData.currentChapterIndex / currentBookData.chapters.length) * 100).toFixed(1);
            nowTab.innerHTML = `
                <div class="read-now-cover">${currentBookData.title}</div>
                <div class="read-now-title">${currentBookData.title}</div>
                <div class="read-now-author">${progress}% 已读</div>
                <button class="read-now-btn" onclick="openReader()">继续阅读</button>
                <button class="read-detail-btn" onclick="switchReadTab('shelf')">返回书架</button>
            `;
        } else {
            nowTab.innerHTML = `
                <div style="color: #8E8E93; margin-bottom: 20px;">还没有在读的书籍</div>
                <button class="read-now-btn" onclick="document.getElementById('book-upload').click()">导入 TXT 书籍</button>
            `;
        }
        
        renderReadNotes();
        renderReadStats();
        renderAiReadNotes();
    }

    async function handleBookUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            const text = e.target.result;
            const chapters = parseTXT(text, file.name);
            
            const book = {
                id: Date.now().toString(),
                title: file.name.replace('.txt', ''),
                chapters: chapters,
                currentChapterIndex: 0,
                addedAt: Date.now(),
                lastReadAt: Date.now()
            };
            
            await BookDB.saveBook(book);
            currentBookId = book.id;
            localStorage.setItem('os_current_book_id', currentBookId);
            
            alert(`成功导入《${book.title}》，共 ${chapters.length} 章`);
            renderReading();
            switchReadTab('now');
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function parseTXT(text, filename) {
        const lines = text.split('\n');
        const chapters = [];
        let currentChapter = { title: '开始', content: '' };
        const chapterRegex = /^(第[零一二三四五六七八九十百千万0-9]+[章回节集卷]|Chapter\s*\d+)/;
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (chapterRegex.test(line) && line.length < 50) {
                if (currentChapter.content) chapters.push(currentChapter);
                currentChapter = { title: line, content: '' };
            } else {
                currentChapter.content += `<p style="margin-bottom: 1em; text-indent: 2em;">${line}</p>`;
            }
        }
        if (currentChapter.content) chapters.push(currentChapter);
        if (chapters.length === 0) chapters.push({ title: '全文', content: `<p style="margin-bottom: 1em; text-indent: 2em;">${text.replace(/\n/g, '</p><p style="margin-bottom: 1em; text-indent: 2em;">')}</p>` });
        return chapters;
    }

    async function deleteBook(id) {
        if(confirm("确定删除这本书吗？")) {
            await BookDB.deleteBook(id);
            if(currentBookId === id) {
                currentBookId = null;
                localStorage.removeItem('os_current_book_id');
            }
            renderReading();
        }
    }

    async function openBook(id) {
        currentBookId = id;
        localStorage.setItem('os_current_book_id', id);
        await renderReading();
        switchReadTab('now');
    }

    function switchReadTab(tab) {
        document.querySelectorAll('#app-reading .acc-nav-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#app-reading .read-content').forEach(c => c.style.display = 'none');
        document.getElementById('nav-read-' + tab).classList.add('active');
        document.getElementById('read-tab-' + tab).style.display = 'block';
    }

    function openReader() {
        if (!currentBookData) return;
        document.getElementById('reader-modal').classList.add('show');
        renderChapter();
        recordReadingDay();
    }

    function closeReader() {
        document.getElementById('reader-modal').classList.remove('show');
        BookDB.saveBook(currentBookData);
        renderReading();
    }

    function renderChapter() {
        const chapter = currentBookData.chapters[currentBookData.currentChapterIndex];
        document.getElementById('reader-book-title').textContent = chapter.title;
        document.getElementById('reader-content').innerHTML = chapter.content;
        document.getElementById('reader-progress').textContent = `${currentBookData.currentChapterIndex + 1} / ${currentBookData.chapters.length}`;
        document.getElementById('reader-content').scrollTop = 0;
    }

    function prevChapter() {
        if (currentBookData.currentChapterIndex > 0) {
            currentBookData.currentChapterIndex--;
            renderChapter();
        }
    }

    function nextChapter() {
        if (currentBookData.currentChapterIndex < currentBookData.chapters.length - 1) {
            currentBookData.currentChapterIndex++;
            renderChapter();
        }
    }

    function toggleReaderMenu() {
        const modal = document.getElementById('toc-modal');
        if (modal.classList.contains('show')) {
            modal.classList.remove('show');
        } else {
            modal.innerHTML = `
                <div class="settings-content" style="height: 80vh; border-radius: 24px 24px 0 0;">
                    <div class="settings-header">
                        <h3>目录</h3>
                        <button onclick="toggleReaderMenu()"><i class="fas fa-times"></i></button>
                    </div>
                    <div id="toc-list"></div>
                </div>
            `;
            const list = document.getElementById('toc-list');
            currentBookData.chapters.forEach((ch, i) => {
                const div = document.createElement('div');
                div.className = `toc-item ${i === currentBookData.currentChapterIndex ? 'active' : ''}`;
                div.textContent = ch.title;
                div.onclick = () => {
                    currentBookData.currentChapterIndex = i;
                    renderChapter();
                    toggleReaderMenu();
                };
                list.appendChild(div);
            });
            modal.classList.add('show');
            setTimeout(() => {
                const active = list.querySelector('.active');
                if(active) active.scrollIntoView({block: 'center'});
            }, 100);
        }
    }

    // Add Excerpt on Selection
    document.getElementById('reader-content').addEventListener('mouseup', () => {
        const selection = window.getSelection().toString().trim();
        if (selection.length > 0) {
            if(confirm("要将这段文字加入摘抄笔记吗？")) {
                let notes = JSON.parse(localStorage.getItem('os_read_notes') || '[]');
                notes.push({
                    id: Date.now().toString(),
                    bookTitle: currentBookData.title,
                    text: selection,
                    timestamp: Date.now()
                });
                localStorage.setItem('os_read_notes', JSON.stringify(notes));
                alert("已加入摘抄！");
                window.getSelection().removeAllRanges();
                renderReadNotes();
            }
        }
    });

    function renderReadNotes() {
        const list = document.getElementById('read-notes-list');
        if(!list) return;
        list.innerHTML = '';
        let notes = JSON.parse(localStorage.getItem('os_read_notes') || '[]');
        const s = getSettings();
        
        list.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom:20px;">
                <input type="text" id="manual-note-input" placeholder="写下你的读后感或随笔..." style="flex:1; padding:12px; border-radius:12px; border:none; outline:none; background:#FFF; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                <button onclick="addManualNote()" style="padding:10px 20px; background:#1C1C1E; color:white; border:none; border-radius:12px; font-weight:bold;">记录</button>
            </div>
        `;
        
        notes.sort((a,b) => b.timestamp - a.timestamp).forEach(n => {
            const date = new Date(n.timestamp);
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            list.innerHTML += `
                <div class="read-note-card">
                    <button onclick="deleteReadNote('${n.id}')" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#FF3B30; z-index:10;"><i class="fas fa-times"></i></button>
                    <div class="read-note-text">${n.text}</div>
                    <div class="read-note-meta">
                        <span>${s.userPersona ? s.userPersona.substring(0,10) : '我'}</span>
                        <span>《${n.bookTitle}》</span>
                    </div>
                    <div class="read-note-month">${monthNames[date.getMonth()]}</div>
                    <div class="read-note-date">${date.getDate()}</div>
                </div>
            `;
        });
    }

    function addManualNote() {
        const text = document.getElementById('manual-note-input').value.trim();
        if(!text) return;
        let notes = JSON.parse(localStorage.getItem('os_read_notes') || '[]');
        notes.push({
            id: Date.now().toString(),
            bookTitle: currentBookData ? currentBookData.title : '随笔',
            text: text,
            timestamp: Date.now()
        });
        localStorage.setItem('os_read_notes', JSON.stringify(notes));
        renderReadNotes();
    }

    function deleteReadNote(id) {
        let notes = JSON.parse(localStorage.getItem('os_read_notes') || '[]');
        notes = notes.filter(n => n.id !== id);
        localStorage.setItem('os_read_notes', JSON.stringify(notes));
        renderReadNotes();
    }

    function recordReadingDay() {
        let days = JSON.parse(localStorage.getItem('os_read_days') || '{}');
        const today = new Date().toISOString().split('T')[0];
        days[today] = (days[today] || 0) + 1;
        localStorage.setItem('os_read_days', JSON.stringify(days));
    }

    function renderReadStats() {
        const heatmap = document.getElementById('read-heatmap');
        if(!heatmap) return;
        heatmap.innerHTML = '';
        let days = JSON.parse(localStorage.getItem('os_read_days') || '{}');
        
        const today = new Date();
        for(let i = 139; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const count = days[dateStr] || 0;
            
            let level = '';
            if(count > 0) level = 'level-1';
            if(count > 5) level = 'level-2';
            if(count > 10) level = 'level-3';
            if(count > 20) level = 'level-4';
            
            heatmap.innerHTML += `<div class="heatmap-cell ${level}" title="${dateStr}: ${count}次阅读"></div>`;
        }
    }

    // --- AI Reading Logic ---
    async function aiReadCurrentChapter() {
        if (!currentBookData) return;
        const s = getSettings();
        if (!s.apiUrl || !s.apiKey) return alert("请先在设置中配置 API");

        const btn = document.getElementById('ai-read-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const chapter = currentBookData.chapters[currentBookData.currentChapterIndex];
        // Extract text content, strip HTML tags, limit to 2000 chars to save tokens
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = chapter.content;
        let textContent = tempDiv.textContent || tempDiv.innerText || "";
        textContent = textContent.substring(0, 2000);

        const sysPrompt = `你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`;
        const prompt = `主人正在读《${currentBookData.title}》的【${chapter.title}】。以下是本章的部分内容：\n\n${textContent}\n\n请你作为主人的伴侣，陪主人一起读这段文字。请从上面的原文中，原封不动地摘抄一段你最喜欢的句子作为 favoriteQuote（必须完全匹配原文），并写一段你的读后感或摘要作为 summary（100字左右，要符合你的人设，带点感情）。\n请严格返回 JSON 格式，不要包含其他任何文字：\n{"favoriteQuote": "原文中的句子", "summary": "你的读后感"}`;

        try {
            const res = await fetch(s.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
                body: JSON.stringify({
                    model: s.apiModel,
                    messages: [{role:'system', content:sysPrompt}, {role:'user', content:prompt}],
                    temperature: 0.7
                })
            });
            const data = await res.json();
            const reply = data.choices[0].message.content.trim();
            
            // Extract JSON
            const jsonStr = reply.substring(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
            const result = JSON.parse(jsonStr);

            let aiNotes = JSON.parse(localStorage.getItem('os_ai_read_notes') || '[]');
            const noteId = Date.now().toString();
            aiNotes.push({
                id: noteId,
                bookTitle: currentBookData.title,
                chapterTitle: chapter.title,
                favoriteQuote: result.favoriteQuote,
                summary: result.summary,
                timestamp: Date.now()
            });
            localStorage.setItem('os_ai_read_notes', JSON.stringify(aiNotes));
            
            // Highlight in chapter content
            if (result.favoriteQuote && chapter.content.includes(result.favoriteQuote)) {
                const escapedSummary = result.summary.replace(/'/g, "&#39;").replace(/"/g, "\"");
                const highlightHtml = `<span class="ai-highlight" onclick="showAiThought(event, '` + escapedSummary + `')">${result.favoriteQuote}</span>`;
                chapter.content = chapter.content.replace(result.favoriteQuote, highlightHtml);
                
                await BookDB.saveBook(currentBookData);
                renderChapter();
            } else {
                // Fallback if exact match fails
                const escapedSummary = result.summary.replace(/'/g, "&#39;").replace(/"/g, "\"");
                chapter.content += `<p style="margin-top: 20px; padding: 15px; background: rgba(175, 82, 222, 0.05); border-radius: 12px; border-left: 4px solid #AF52DE; font-size: 0.9em; color: #555; cursor: pointer;" onclick="showAiThought(event, '` + escapedSummary + `')"><strong>${s.charName} 的读后感：</strong><br>${result.summary}</p>`;
                await BookDB.saveBook(currentBookData);
                renderChapter();
            }
            
            alert(`${s.charName} 读完啦！句子已在文中标记，点击可查看想法。`);
            renderAiReadNotes();
        } catch (e) {
            alert("AI 阅读失败，请检查网络或 API 设置。");
            console.error(e);
        } finally {
            btn.innerHTML = '<i class="fas fa-magic"></i>';
            btn.disabled = false;
        }
    }

    function showAiThought(event, summary) {
        event.stopPropagation();
        let popup = document.getElementById('ai-thought-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'ai-thought-popup';
            document.body.appendChild(popup);
            
            document.addEventListener('click', (e) => {
                if (popup.style.display === 'flex' && !popup.contains(e.target)) {
                    popup.style.display = 'none';
                }
            });
        }
        
        const s = getSettings();
        popup.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #E5E5EA; padding-bottom: 8px;">
                <img src="${s.charAvatar || 'https://via.placeholder.com/30/E5E5EA/000000?text=AI'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                <span style="font-weight: bold; font-size: 0.9em; color: #333;">${s.charName} 的想法</span>
            </div>
            <div style="font-size: 0.95em; color: #555; line-height: 1.5;">${summary}</div>
        `;
        
        popup.style.display = 'flex';
        
        const rect = event.target.getBoundingClientRect();
        let left = rect.left + rect.width / 2;
        let top = rect.top;
        
        if (left < window.innerWidth * 0.4) left = window.innerWidth * 0.4;
        if (left > window.innerWidth * 0.6) left = window.innerWidth * 0.6;
        
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    function renderAiReadNotes() {
        const list = document.getElementById('ai-read-notes-list');
        if (!list) return;
        list.innerHTML = '';
        
        let aiNotes = JSON.parse(localStorage.getItem('os_ai_read_notes') || '[]');
        if (aiNotes.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#8E8E93; padding: 20px;">AI 还没有读过书哦</div>';
            return;
        }

        // Group by book
        const books = {};
        aiNotes.forEach(n => {
            if (!books[n.bookTitle]) books[n.bookTitle] = [];
            books[n.bookTitle].push(n);
        });

        const s = getSettings();

        for (const [bookTitle, notes] of Object.entries(books)) {
            let notesHtml = '';
            notes.sort((a,b) => b.timestamp - a.timestamp).forEach(n => {
                const dateStr = new Date(n.timestamp).toLocaleDateString();
                notesHtml += `
                    <div style="background: #FFF; border-radius: 12px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-weight: bold; color: #333; font-size: 0.9em;">${n.chapterTitle}</span>
                            <span style="font-size: 0.75em; color: #8E8E93;">${dateStr}</span>
                        </div>
                        <div style="background: #F5F9FF; padding: 10px; border-radius: 8px; font-style: italic; color: #555; font-size: 0.9em; margin-bottom: 10px; border-left: 3px solid #A3D1FF;">
                            "${n.favoriteQuote}"
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <img src="${s.charAvatar || 'https://via.placeholder.com/30/E5E5EA/000000?text=AI'}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                            <div style="background: #F2F2F7; padding: 10px; border-radius: 12px; border-top-left-radius: 0; font-size: 0.9em; color: #333; line-height: 1.5;">
                                ${n.summary}
                            </div>
                        </div>
                        <button onclick="deleteAiReadNote('${n.id}')" style="background: none; border: none; color: #FF3B30; font-size: 0.8em; margin-top: 10px; cursor: pointer;"><i class="fas fa-trash"></i> 删除</button>
                    </div>
                `;
            });

            list.innerHTML += `
                <div class="card" style="background: #F4F5F7; border: none; box-shadow: none; padding: 0; margin-bottom: 20px;">
                    <div style="padding: 15px; background: linear-gradient(135deg, #E0C3FC, #8EC5FC); color: white; border-radius: 16px; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-book"></i> 《${bookTitle}》
                    </div>
                    <div style="padding: 0 5px;">
                        ${notesHtml}
                    </div>
                </div>
            `;
        }
    }

    function deleteAiReadNote(id) {
        if (confirm("确定删除这条 AI 笔记吗？")) {
            let aiNotes = JSON.parse(localStorage.getItem('os_ai_read_notes') || '[]');
            aiNotes = aiNotes.filter(n => n.id !== id);
            localStorage.setItem('os_ai_read_notes', JSON.stringify(aiNotes));
            renderAiReadNotes();
        }
    }

    function openAccounting() {
        const splash = document.getElementById('app-accounting-splash');
        splash.style.display = 'flex';
        setTimeout(() => splash.classList.add('show'), 10);
        setTimeout(() => {
            splash.classList.remove('show');
            setTimeout(() => splash.style.display = 'none', 300);
            openInternalApp('app-accounting');
            renderAccounting();
        }, 3000);
    }

    let currentAccDate = new Date();

    function switchAccTab(tab) {
        document.querySelectorAll('.acc-nav-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#app-accounting .acc-content').forEach(c => c.style.display = 'none');
        document.getElementById('nav-acc-' + tab).classList.add('active');
        document.getElementById('acc-tab-' + tab).style.display = 'block';
        
        if (tab === 'receipt') renderAccounting();
        if (tab === 'calendar') {
            renderAccCalendarBar();
            const tzOffset = currentAccDate.getTimezoneOffset() * 60000;
            const dateStr = (new Date(currentAccDate - tzOffset)).toISOString().split('T')[0];
            renderAccCalendarDay(dateStr);
        }
        if (tab === 'wishlist') renderWishlist();
    }

    function jumpToAccDate() {
        const dateVal = document.getElementById('acc-cal-search-date').value;
        if (dateVal) {
            currentAccDate = new Date(dateVal);
            renderAccCalendarBar();
            renderAccCalendarDay(dateVal);
        }
    }

    function renderAccCalendarBar() {
        const bar = document.getElementById('acc-cal-number-bar');
        bar.innerHTML = '';
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        
        for (let i = -15; i <= 15; i++) {
            const d = new Date(currentAccDate);
            d.setDate(currentAccDate.getDate() + i);
            const tzOffset = d.getTimezoneOffset() * 60000;
            const dateStr = (new Date(d - tzOffset)).toISOString().split('T')[0];
            const isSelected = i === 0;
            
            const el = document.createElement('div');
            el.className = `acc-cal-day-item ${isSelected ? 'active' : ''}`;
            el.innerHTML = `<div class="day-name">${days[d.getDay()]}</div><div class="day-num">${d.getDate()}</div>`;
            el.onclick = () => {
                currentAccDate = d;
                renderAccCalendarBar();
                renderAccCalendarDay(dateStr);
            };
            bar.appendChild(el);
            
            if (isSelected) {
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }, 10);
            }
        }
    }

    function renderAccCalendarDay(dateStr) {
        let data = JSON.parse(localStorage.getItem('os_accounting') || '{"records":[]}');
        let dayRecords = data.records.filter(r => r.date === dateStr);
        
        const container = document.getElementById('acc-cal-records');
        container.innerHTML = '';
        if (dayRecords.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-sub); font-family:monospace; padding: 40px 20px;">NO RECORDS FOR THIS DAY</div>';
            return;
        }
        
        let total = 0;
        dayRecords.forEach(r => {
            const sign = r.type === 'income' ? '+' : '-';
            total += r.type === 'income' ? r.amount : -r.amount;
            const recordId = r.id || r.date+r.category;
            container.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 0; border-bottom: 1px dashed #E5E5EA; font-family:monospace; background: #FFF; border-radius: 12px; margin-bottom: 10px; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                    <span style="font-weight:bold;">${r.category}</span>
                    <div style="display:flex; align-items:center; gap: 15px;">
                        <span style="color: ${r.type === 'income' ? '#34C759' : '#111'}; font-weight:bold;">${sign}$${r.amount.toFixed(2)}</span>
                        <button onclick="deleteAccounting('${recordId}')" style="color:#FF3B30; background:none; border:none; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            `;
        });
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px; font-family:monospace; font-weight:bold; font-size: 1.1em; background: #1C1C1E; color: #FFF; border-radius: 12px; margin-top: 10px;">
                <span>DAILY TOTAL</span>
                <span>$${total.toFixed(2)}</span>
            </div>
        `;
    }

    function renderAccounting() {
        let data = JSON.parse(localStorage.getItem('os_accounting') || '{"records":[]}');
        const wrapper = document.getElementById('acc-receipt-wrapper');
        wrapper.innerHTML = '';
        
        const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000; const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, -1);
        const currentMonth = localISOTime.substring(0, 7);
        
        let monthRecords = data.records.filter(r => r.date.startsWith(currentMonth)).sort((a,b) => b.date.localeCompare(a.date));
        
        if (monthRecords.length === 0) {
            wrapper.innerHTML = '<div style="text-align:center; color:var(--text-sub); font-family:monospace; margin-top:20px;">NO TRANSACTIONS YET</div>';
        } else {
            let monthTotal = 0;
            let itemsHtml = '';
            monthRecords.forEach((r) => {
                const sign = r.type === 'income' ? '+' : '-';
                monthTotal += r.type === 'income' ? r.amount : -r.amount;
                const recordId = r.id || r.date+r.category;
                itemsHtml += `
                    <div class="receipt-item" style="position:relative; padding-right: 20px;">
                        <span class="name">${r.category}</span>
                        <span>${sign}$${r.amount.toFixed(2)}</span>
                        <button onclick="deleteAccounting('${recordId}')" style="position:absolute; right:0; color:#FF3B30; background:none; border:none; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                `;
            });
            
            const dateStr = new Date().toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
            const orderNum = Math.floor(Math.random() * 900000) + 100000;
            
            wrapper.innerHTML = `
                <div class="receipt-container">
                    <div class="receipt-header">
                        <h2>TODO MART</h2>
                        <p>Your Daily Task Shop</p>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.7em; color:#555; margin-bottom:10px;">
                        <span>${dateStr}</span>
                        <span>#${orderNum}</span>
                    </div>
                    <div class="receipt-divider"></div>
                    ${itemsHtml}
                    <div class="receipt-divider"></div>
                    <div class="receipt-total">
                        <span>NET TOTAL</span>
                        <span>$${monthTotal.toFixed(2)}</span>
                    </div>
                    <div style="font-size:0.7em; color:#555; margin-top:5px;">ITEM COUNT: ${monthRecords.length}</div>
                    <div class="receipt-barcode">||| |||| | |||| ||</div>
                    <div class="receipt-footer">"Thank you for shopping at TODO MART!"</div>
                </div>
            `;
        }
    }
    function addAccountingRecord() {
        const amount = parseFloat(document.getElementById('acc-amount').value); 
        const category = document.getElementById('acc-category').value.trim(); 
        const type = document.getElementById('acc-type').value;
        if(isNaN(amount) || !category) return alert("Please enter price and item name.");
        let data = JSON.parse(localStorage.getItem('os_accounting') || '{"records":[]}');
        const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000; const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, -1); const todayStr = localISOTime.split('T')[0];
        data.records.push({ id: Date.now().toString(), date: todayStr, amount, category, type, note: '' }); localStorage.setItem('os_accounting', JSON.stringify(data));
        document.getElementById('acc-amount').value = ''; document.getElementById('acc-category').value = ''; 
        renderAccounting();
        if(document.getElementById('acc-tab-calendar').style.display === 'block') {
            const tzOffset = currentAccDate.getTimezoneOffset() * 60000;
            const dateStr = (new Date(currentAccDate - tzOffset)).toISOString().split('T')[0];
            renderAccCalendarDay(dateStr);
        }
    }
    function deleteAccounting(id) {
        if(confirm("Delete this record?")) {
            let data = JSON.parse(localStorage.getItem('os_accounting') || '{"records":[]}');
            data.records = data.records.filter(r => (r.id || r.date+r.category) !== id);
            localStorage.setItem('os_accounting', JSON.stringify(data));
            renderAccounting();
            if(document.getElementById('acc-tab-calendar').style.display === 'block') {
                const tzOffset = currentAccDate.getTimezoneOffset() * 60000;
                const dateStr = (new Date(currentAccDate - tzOffset)).toISOString().split('T')[0];
                renderAccCalendarDay(dateStr);
            }
        }
    }
    function renderWishlist() {
        const container = document.getElementById('wishlist-container');
        let wishlist = JSON.parse(localStorage.getItem('os_wishlist') || '[]');
        container.innerHTML = '';
        wishlist.forEach(item => {
            const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
            const purchasedClass = item.purchased ? 'purchased' : '';
            container.innerHTML += `
                <div class="wishlist-item ${purchasedClass}" onclick="toggleWishlist('${item.id}')">
                    <span class="wish-text">${item.name}</span>
                    <span class="wish-time">${timeStr}</span>
                </div>
            `;
        });
    }
    function addWishlist() {
        const name = document.getElementById('wish-item').value.trim();
        if(!name) return;
        let wishlist = JSON.parse(localStorage.getItem('os_wishlist') || '[]');
        wishlist.push({ id: Date.now().toString(), name, timestamp: Date.now(), purchased: false });
        localStorage.setItem('os_wishlist', JSON.stringify(wishlist));
        document.getElementById('wish-item').value = '';
        renderWishlist();
    }
    function toggleWishlist(id) {
        let wishlist = JSON.parse(localStorage.getItem('os_wishlist') || '[]');
        const item = wishlist.find(i => i.id === id);
        if (item) {
            item.purchased = !item.purchased;
            localStorage.setItem('os_wishlist', JSON.stringify(wishlist));
            renderWishlist();
        }
    }

    async function generateDream() {
        const s = getSettings(); if (!s.apiUrl || !s.apiKey) return alert("请先配置API");
        const contentDiv = document.getElementById('dream-content'); contentDiv.style.display = 'block'; contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">AI正在编织梦境...</div>';
        const sysPrompt = `你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`; const prompt = `请以"${s.charName}"的身份，描述一个你昨晚做的梦，梦里有我（主人）。要求充满想象力、温柔治愈，字数200字左右。`;
        try {
            const res = await fetch(s.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` }, body: JSON.stringify({ model: s.apiModel, messages: [{role:'system', content:sysPrompt}, {role:'user', content:prompt}], temperature: 0.9 }) });
            const data = await res.json(); contentDiv.innerHTML = `<div style="padding:16px;">${data.choices[0].message.content.trim().replace(/\n/g, '<br>')}</div>`;
        } catch (e) { contentDiv.innerHTML = '<div style="padding:16px; color:red;">梦境生成失败，请检查网络或API设置。</div>'; }
    }

    function loadGlobalContext() { document.getElementById('global-context-input').value = localStorage.getItem('os_global_context') || ''; }
    function saveGlobalContext() { localStorage.setItem('os_global_context', document.getElementById('global-context-input').value.trim()); alert("世界观设定已保存！"); }

    function toggleHealthMode() { document.getElementById('app-health').classList.toggle('health-light-mode'); }
    
    function switchHealthTab(tab) {
        document.querySelectorAll('#app-health .mem-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#app-health .health-content').forEach(c => c.style.display = 'none');
        event.target.classList.add('active');
        document.getElementById('health-tab-' + tab).style.display = 'block';
        
        if (tab === 'today') {
            loadHealthDataForDate();
        }
        if (tab === 'calendar') {
            const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000;
            if(!document.getElementById('health-cal-date').value) {
                document.getElementById('health-cal-date').value = (new Date(now - tzOffset)).toISOString().split('T')[0];
            }
            renderHealthCalendarDay();
        }
    }

    function getHealthDateKey(dateStr = null) {
        if (dateStr) return 'os_health_data_' + dateStr;
        const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000;
        return 'os_health_data_' + (new Date(now - tzOffset)).toISOString().split('T')[0];
    }
    
    function loadHealthDataForDate() {
        const now = new Date(); const tzOffset = now.getTimezoneOffset() * 60000;
        const todayStr = (new Date(now - tzOffset)).toISOString().split('T')[0];
        document.getElementById('health-today-date-display').textContent = `今天 (${todayStr})`;

        const key = getHealthDateKey();
        const data = JSON.parse(localStorage.getItem(key) || '{"steps":0, "sleep":0, "weight":0, "diet_breakfast":"", "diet_lunch":"", "diet_dinner":""}');
        document.getElementById('health-steps-display').textContent = data.steps || 0; 
        document.getElementById('health-sleep-display').innerHTML = `${data.sleep || 0} <span style="font-size:0.5em; font-weight:normal;">小时</span>`; 
        document.getElementById('health-weight-display').innerHTML = `${data.weight || 0} <span style="font-size:0.5em; font-weight:normal;">kg</span>`;
        document.getElementById('health-steps-input').value = data.steps || ''; 
        document.getElementById('health-sleep-input').value = data.sleep || ''; 
        document.getElementById('health-weight-input').value = data.weight || ''; 
        document.getElementById('health-diet-breakfast').value = data.diet_breakfast || '';
        document.getElementById('health-diet-lunch').value = data.diet_lunch || '';
        document.getElementById('health-diet-dinner').value = data.diet_dinner || '';
        
        const fitness = JSON.parse(localStorage.getItem('os_fitness_goals') || '{"shape":"", "ideas":""}');
        document.getElementById('fitness-shape').value = fitness.shape || '';
        document.getElementById('fitness-ideas').value = fitness.ideas || '';
    }
    
    function saveHealthData() {
        const key = getHealthDateKey();
        const data = { 
            steps: document.getElementById('health-steps-input').value || 0, 
            sleep: document.getElementById('health-sleep-input').value || 0, 
            weight: document.getElementById('health-weight-input').value || 0, 
            diet_breakfast: document.getElementById('health-diet-breakfast').value || '',
            diet_lunch: document.getElementById('health-diet-lunch').value || '',
            diet_dinner: document.getElementById('health-diet-dinner').value || ''
        };
        localStorage.setItem(key, JSON.stringify(data)); 
        alert("健康数据已保存！");
        syncToBackend();
    }

    function renderHealthCalendarDay() {
        const dateStr = document.getElementById('health-cal-date').value;
        const key = getHealthDateKey(dateStr);
        const data = JSON.parse(localStorage.getItem(key) || 'null');
        
        const container = document.getElementById('health-cal-records');
        container.innerHTML = '';
        
        if (!data) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding: 20px;">该日期没有健康记录</div>';
            return;
        }
        
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #2C2C2E; padding-bottom:10px;">
                    <span style="color:#FF2D55;"><i class="fas fa-shoe-prints"></i> 步数</span>
                    <span style="font-weight:bold;">${data.steps || 0} 步</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #2C2C2E; padding-bottom:10px;">
                    <span style="color:#5AC8FA;"><i class="fas fa-moon"></i> 睡眠</span>
                    <span style="font-weight:bold;">${data.sleep || 0} 小时</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #2C2C2E; padding-bottom:10px;">
                    <span style="color:#30D158;"><i class="fas fa-weight"></i> 体重</span>
                    <span style="font-weight:bold;">${data.weight || 0} kg</span>
                </div>
                <div>
                    <div style="color:#FF9500; margin-bottom:5px;"><i class="fas fa-utensils"></i> 饮食</div>
                    <div style="font-size:0.9em; color:#C7C7CC; padding-left:20px;">
                        <div>早：${data.diet_breakfast || '无'}</div>
                        <div>中：${data.diet_lunch || '无'}</div>
                        <div>晚：${data.diet_dinner || '无'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    async function analyzeDiet() {
        const s = getSettings(); if (!s.apiUrl || !s.apiKey) return alert("请先配置API");
        const b = document.getElementById('health-diet-breakfast').value || '无';
        const l = document.getElementById('health-diet-lunch').value || '无';
        const d = document.getElementById('health-diet-dinner').value || '无';
        if (b==='无' && l==='无' && d==='无') return alert("请先填写饮食记录");
        
        saveHealthData();
        const resDiv = document.getElementById('diet-analysis-result');
        resDiv.innerHTML = 'AI 正在分析营养价值...';
        
        const sysPrompt = `你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`; 
        const prompt = `主人今天的饮食如下：\n早餐：${b}\n午餐：${l}\n晚餐：${d}\n\n请分析这三餐的营养价值，并以你的人设给出一句建议或吐槽（100字以内）。注意：这是线上回复，请不要包含任何动作、神态等线下描写（不要使用括号或星号括起来的动作）。`;
        
        try {
            const res = await fetch(s.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` }, body: JSON.stringify({ model: s.apiModel, messages: [{role:'system', content:sysPrompt}, {role:'user', content:prompt}], temperature: 0.7 }) });
            const resData = await res.json(); 
            const reply = resData.choices[0].message.content.trim();
            resDiv.innerHTML = reply;
            
            MemorySystem.addMemory("饮食营养分析", `主人今天的饮食：早[${b}] 中[${l}] 晚[${d}]。我的评价：${reply}`, 6, 'fragment');
        } catch (e) { resDiv.innerHTML = '分析失败。'; }
    }

    function saveFitnessGoals() {
        const shape = document.getElementById('fitness-shape').value.trim();
        const ideas = document.getElementById('fitness-ideas').value.trim();
        if (!shape && !ideas) return alert("请填写目标");
        localStorage.setItem('os_fitness_goals', JSON.stringify({shape, ideas}));
        
        MemorySystem.addMemory("主人的健身目标", `理想身材：${shape}。运动想法：${ideas}。`, 8, 'fragment');
        alert("目标已保存并同步给 AI 记忆库！");
        syncToBackend();
    }
    
    async function getHealthAdvice() {
        const s = getSettings(); if (!s.apiUrl || !s.apiKey) return alert("请先配置API");
        const adviceDiv = document.getElementById('health-ai-advice'); adviceDiv.innerHTML = '正在分析您的健康数据...';
        const data = JSON.parse(localStorage.getItem(getHealthDateKey()) || '{"steps":0, "sleep":0, "weight":0, "diet_breakfast":"", "diet_lunch":"", "diet_dinner":""}');
        const fitness = JSON.parse(localStorage.getItem('os_fitness_goals') || '{"shape":"", "ideas":""}');
        
        const sysPrompt = `你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`; 
        const prompt = `主人今天的健康数据如下：\n步数：${data.steps}步\n睡眠：${data.sleep}小时\n体重：${data.weight}kg\n饮食：早[${data.diet_breakfast}] 中[${data.diet_lunch}] 晚[${data.diet_dinner}]\n主人的健身目标：${fitness.shape}，想法：${fitness.ideas}\n\n请以你的设定身份，给出详细的健身和饮食建议（例如怎么吃更健康，一周建议运动几次，具体的运动计划等）。注意：这是线上回复，请不要包含任何动作、神态等线下描写（不要使用括号或星号括起来的动作）。`;
        try {
            const res = await fetch(s.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` }, body: JSON.stringify({ model: s.apiModel, messages: [{role:'system', content:sysPrompt}, {role:'user', content:prompt}], temperature: 0.7 }) });
            const resData = await res.json(); adviceDiv.innerHTML = resData.choices[0].message.content.trim();
        } catch (e) { adviceDiv.innerHTML = '获取建议失败。'; }
    }

    let usedDietOptions = [];
    async function generateDietOptions() {
        const s = getSettings(); if (!s.apiUrl || !s.apiKey) return alert("请先配置API");
        document.getElementById('diet-options').innerHTML = '正在思考...';
        const sysPrompt = `你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`;
        const prompt = `主人不知道吃什么。请推荐3种不同的食物，包含名称和简单的营养成分（热量、蛋白质等）。不要和之前的推荐重复（之前推荐过：${usedDietOptions.join(',')}）。同时附上一句符合你人设的吐槽或关心（比如：选择困难了？）。严格返回JSON格式：{"dialogue": "AI的话", "foods": [{"name": "食物名", "nutrition": "营养成分"}]}`;
        
        try {
            const res = await fetch(s.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` }, body: JSON.stringify({ model: s.apiModel, messages: [{role:'system', content:sysPrompt}, {role:'user', content:prompt}], temperature: 0.8 }) });
            const data = await res.json();
            const reply = data.choices[0].message.content.trim();
            const jsonStr = reply.substring(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
            const result = JSON.parse(jsonStr);
            
            document.getElementById('diet-ai-dialogue').textContent = `"${result.dialogue}"`;
            const optsDiv = document.getElementById('diet-options');
            optsDiv.innerHTML = '';
            result.foods.forEach(f => {
                usedDietOptions.push(f.name);
                const btn = document.createElement('button');
                btn.style.cssText = "text-align:left; padding:10px; background:#2C2C2E; color:white; border:none; border-radius:12px; cursor:pointer;";
                btn.innerHTML = `<div style="font-weight:bold;">${f.name}</div><div style="font-size:0.8em; color:#8E8E93;">${f.nutrition}</div>`;
                btn.onclick = () => selectDietOption(f.name);
                optsDiv.appendChild(btn);
            });
        } catch (e) { document.getElementById('diet-options').innerHTML = '生成失败，请重试。'; }
    }

    async function selectDietOption(foodName) {
        const s = getSettings();
        const b = document.getElementById('health-diet-breakfast');
        const l = document.getElementById('health-diet-lunch');
        const d = document.getElementById('health-diet-dinner');
        if (!b.value) b.value = foodName;
        else if (!l.value) l.value = foodName;
        else d.value = foodName;
        
        document.getElementById('diet-options').innerHTML = `<div style="color:#30D158;">已选择：${foodName}</div><div id="diet-reaction" style="margin-top:10px; font-style:italic; color:#C7C7CC; font-size:0.9em;">AI正在回应...</div>`;
        
        const sysPrompt = `你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`;
        const prompt = `主人最终决定吃：${foodName}。请以你的人设对主人的选择做出回应（50字以内）。`;
        try {
            const res = await fetch(s.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` }, body: JSON.stringify({ model: s.apiModel, messages: [{role:'system', content:sysPrompt}, {role:'user', content:prompt}], temperature: 0.7 }) });
            const data = await res.json();
            document.getElementById('diet-reaction').textContent = `"${data.choices[0].message.content.trim()}"`;
        } catch (e) { document.getElementById('diet-reaction').textContent = ''; }
    }

    async function requestAIResponse() {
        showTyping();
        const s = getSettings();
        
        if (!s.apiUrl || !s.apiKey) {
            removeTyping();
            chatHistory.push({ role: 'assistant', content: `[系统提示] 请先在设置中配置 API URL 和 API Key。`, timestamp: Date.now() });
            saveChatHistory(); renderChatHistory();
            return;
        }

        try {
            const contextWindow = chatHistory.slice(-20).map(m => {
                const temp = document.createElement('div'); temp.innerHTML = m.content;
                const img = temp.querySelector('img');
                if (img && img.src.startsWith('data:image')) {
                    img.remove();
                    const textContent = temp.textContent || temp.innerText || "";
                    let contentArray = [];
                    if (textContent.trim()) contentArray.push({ type: "text", text: textContent.trim() });
                    contentArray.push({ type: "image_url", image_url: { url: img.src } });
                    return { role: m.role === 'ai' ? 'assistant' : m.role, content: contentArray };
                }
                return { role: m.role === 'ai' ? 'assistant' : m.role, content: temp.textContent || temp.innerText || "[图片/文件]" };
            });

            // 注入世界观和人设
            const globalContext = localStorage.getItem('os_global_context') || '';
            let sysPrompt = `你是${s.charName}。你的设定：${s.charPersona}\n我的设定：${s.userPersona}\n`;
            if (globalContext) sysPrompt += `世界观背景：${globalContext}\n`;
            
            if (!isOnlineMode) {
                sysPrompt += `\n【重要指令】当前为线下模式，请在回复中包含丰富的动作、神态描写（使用括号或星号括起来）。`;
            } else {
                sysPrompt += `\n【重要指令】当前为线上聊天模式（类似微信/iMessage），请像正常人发消息一样回复，**绝对不要**包含任何动作、神态等线下描写（不要使用括号或星号括起来的动作）。如果需要分多条发送，请使用 ||| 分隔。`;
            }

            // 注入相关记忆
            const lastUserMsg = contextWindow.filter(m => m.role === 'user').pop();
            if (lastUserMsg) {
                const query = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : lastUserMsg.content.find(c => c.type === 'text')?.text || '';
                const relevantMemories = await MemorySystem.search(query);
                if (relevantMemories.length > 0) {
                    sysPrompt += `\n\n【相关记忆参考】\n` + relevantMemories.slice(0, 3).map(m => `- ${m.content}`).join('\n');
                }
            }

            contextWindow.unshift({ role: 'system', content: sysPrompt });

            let fetchUrl = s.apiUrl; 
            if (!fetchUrl.includes('/chat/completions')) { 
                if (fetchUrl.endsWith('/')) fetchUrl = fetchUrl.slice(0, -1); 
                if (fetchUrl.endsWith('/v1')) fetchUrl += '/chat/completions'; 
                else fetchUrl += '/v1/chat/completions'; 
            }

            const response = await fetch(fetchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
                body: JSON.stringify({ 
                    model: s.apiModel,
                    messages: contextWindow, 
                    temperature: parseFloat(s.temperature)
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("Chat API Error Response:", data);
                let errorMsg = data.error || 'API 请求失败';
                if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
                throw new Error(`API 错误 (${response.status}): ${errorMsg}`);
            }
            
            if (data.error) throw new Error(data.error);
            
            removeTyping();
            
            const reply = data.choices[0].message.content;
            if (isOnlineMode && reply.includes('|||')) {
                const parts = reply.split('|||').map(p => p.trim()).filter(p => p);
                for (let i = 0; i < parts.length; i++) {
                    setTimeout(() => { chatHistory.push({ role: 'assistant', content: parts[i], timestamp: Date.now() }); saveChatHistory(); renderChatHistory(); }, i * 1200);
                }
            } else {
                chatHistory.push({ role: 'assistant', content: reply, timestamp: Date.now() });
                saveChatHistory(); renderChatHistory();
            }
        } catch (error) {
            removeTyping(); chatHistory.push({ role: 'assistant', content: `[连接出错] ${error.message}`, timestamp: Date.now() }); saveChatHistory(); renderChatHistory();
        }
    }

    function formatChatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        if (isToday) return `Today ${hours}:${minutes}`;
        return `${date.getMonth()+1}/${date.getDate()} ${hours}:${minutes}`;
    }

    function renderChatHistory() {
        const body = document.getElementById('chatBody');
        body.innerHTML = '';
        const s = getSettings();
        if(chatHistory.length === 0) {
            appendMessage('ai', `汪！主人找${s.charName}有什么事吗？`, -1, true);
        } else {
            let lastTime = 0;
            chatHistory.forEach((msg, index) => {
                const msgTime = msg.timestamp || 0;
                if (msgTime - lastTime > 5 * 60 * 1000) {
                    const timeDiv = document.createElement('div');
                    timeDiv.className = 'chat-time-divider';
                    timeDiv.textContent = formatChatTime(msgTime);
                    body.appendChild(timeDiv);
                    lastTime = msgTime;
                }
                const nextMsg = chatHistory[index + 1];
                const isLastInGroup = !nextMsg || nextMsg.role !== msg.role || ((nextMsg.timestamp || 0) - msgTime > 5 * 60 * 1000);
                appendMessage(msg.role === 'assistant' ? 'ai' : 'user', msg.content, index, isLastInGroup);
            });
        }
        scrollToBottom();
    }

    // --- Other Utilities (Home, Settings, etc.) ---
    document.addEventListener('input', function(e) { if (e.target.classList.contains('editable') && e.target.id) localStorage.setItem('os_text_' + e.target.id, e.target.innerHTML); });
    function loadEditableTexts() { document.querySelectorAll('.editable').forEach(el => { if (el.id) { const saved = localStorage.getItem('os_text_' + el.id); if (saved) el.innerHTML = saved; } }); }
    function updateTime() {
        const now = new Date();
        document.getElementById('current-time').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        document.getElementById('current-date').textContent = `${now.getMonth() + 1}月${now.getDate()}日`;
        document.getElementById('current-weekday').textContent = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
    }
    setInterval(updateTime, 1000); updateTime();

    async function fetchWeather(lat = null, lon = null) {
        try {
            let url = lat !== null ? `https://wttr.in/${lat},${lon}?format=j1` : 'https://wttr.in/?format=j1';
            const res = await fetch(url); const data = await res.json();
            if(!localStorage.getItem('os_text_weather-city')) document.getElementById('weather-city').textContent = data.nearest_area[0].areaName[0].value;
            document.getElementById('weather-temp').textContent = data.current_condition[0].temp_C + '°';
            document.getElementById('weather-desc').textContent = data.current_condition[0].lang_zh[0].value;
        } catch (e) {}
    }
    function updateWeatherWithLocation() {
        document.getElementById('weather-city').textContent = "定位中...";
        if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => fetchWeather(p.coords.latitude, p.coords.longitude), () => fetchWeather(), { timeout: 10000 });
        else fetchWeather();
    }
    updateWeatherWithLocation(); setInterval(updateWeatherWithLocation, 30 * 60 * 1000);

    const quotesContainer = document.getElementById('quotes-container');
    const dots = document.querySelectorAll('.dot');
    quotesContainer.addEventListener('scroll', () => { const index = Math.round(quotesContainer.scrollLeft / quotesContainer.offsetWidth); dots.forEach((dot, i) => dot.classList.toggle('active', i === index)); });

    // new Chart(document.getElementById('healthChart').getContext('2d'), { type: 'line', data: { labels: ['一', '二', '三', '四', '五', '六', '日'], datasets: [{ label: '睡眠', data: [7, 6.5, 8, 7.5, 6, 8.5, 9], borderColor: '#007AFF', backgroundColor: 'rgba(0, 122, 255, 0.1)', borderWidth: 2, fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 12 } } } });

    function handleGalleryUpload(event) { 
        const file = event.target.files[0]; 
        if (file) { 
            const reader = new FileReader(); 
            reader.onload = function(e) { 
                compressImage(e.target.result, 800, (compressed) => {
                    let images = JSON.parse(localStorage.getItem('os_gallery') || '[]'); 
                    images.push(compressed); 
                    localStorage.setItem('os_gallery', JSON.stringify(images)); 
                    renderGallery(); 
                    syncToBackend();
                });
            }; 
            reader.readAsDataURL(file); 
        } 
    }
    function renderGallery() { 
        const container = document.getElementById('gallery-grid'); 
        if(!container) return;
        container.innerHTML = ''; 
        let images = JSON.parse(localStorage.getItem('os_gallery') || '[]'); 
        if (images.length === 0) images = ['https://via.placeholder.com/120x120/E5E5EA/8E8E93?text=Art+1', 'https://via.placeholder.com/120x120/E5E5EA/8E8E93?text=Photo+1']; 
        images.forEach(src => { 
            const img = document.createElement('img'); 
            img.src = src; 
            img.style.width = '100%'; img.style.height = '120px'; img.style.objectFit = 'cover'; img.style.borderRadius = '12px';
            container.appendChild(img); 
        }); 
    }

    function openIframe(url) { document.getElementById('app-iframe').src = url; const overlay = document.getElementById('iframe-overlay'); overlay.style.display = 'flex'; setTimeout(() => overlay.classList.add('show'), 10); }
    function closeIframe() { const overlay = document.getElementById('iframe-overlay'); overlay.classList.remove('show'); setTimeout(() => { overlay.style.display = 'none'; document.getElementById('app-iframe').src = ''; }, 300); }

    function autoResize(textarea) { textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px'; }
    function handleEnter(e, sendFunc) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFunc(); e.target.style.height = 'auto'; } }
    function toggleSendIcon() { const input = document.getElementById('chatInput'); const btn = document.getElementById('sendBtn'); if (input.value.trim().length > 0) { btn.innerHTML = '<i class="fas fa-arrow-up"></i>'; btn.classList.add('active'); } else { btn.innerHTML = '<i class="fas fa-microphone"></i>'; btn.classList.remove('active'); } }

    // Schedule Logic (Condensed)
    let calDate = new Date(); let selDate = new Date(); 
    let events = JSON.parse(localStorage.getItem('os_events') || '{}');
    if (Array.isArray(events)) events = {}; // Fix for old array format
    
    function renderCalendar() {
        const year = calDate.getFullYear(); const month = calDate.getMonth(); 
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;
        
        let firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysContainer = document.getElementById('cal-days'); daysContainer.innerHTML = '';
        
        for (let i = 0; i < firstDay; i++) daysContainer.innerHTML += `<div></div>`;
        
        const today = new Date();

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === i;
            const isSelected = selDate.getFullYear() === year && selDate.getMonth() === month && selDate.getDate() === i;
            const currentDayOfWeek = new Date(year, month, i).getDay();
            const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;
            
            let dayClass = 'ios-cal-day';
            if (isToday) dayClass += ' today';
            else if (isSelected) dayClass += ' selected';
            else if (isWeekend) dayClass += ' weekend';

            let dotsHtml = ''; 
            if (events[dateStr] && events[dateStr].length > 0) { 
                dotsHtml = '<div class="ios-cal-dot"></div>'; 
            }
            
            const dayWrap = document.createElement('div'); 
            dayWrap.className = 'ios-cal-day-wrap';
            dayWrap.innerHTML = `<div class="${dayClass}">${i}</div>${dotsHtml}`; 
            dayWrap.onclick = () => { selDate = new Date(year, month, i); renderCalendar(); }; 
            daysContainer.appendChild(dayWrap);
        }
        renderEvents();
    }

    function resetToToday() {
        calDate = new Date();
        selDate = new Date();
        renderCalendar();
    }

    function changeMonth(delta) { calDate.setMonth(calDate.getMonth() + delta); renderCalendar(); }

    function renderEvents() {
        const dateStr = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, '0')}-${String(selDate.getDate()).padStart(2, '0')}`;
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        document.getElementById('selected-date-text').textContent = `${dayNames[selDate.getDay()]}, ${selDate.getDate()} ${monthNames[selDate.getMonth()]}`;
        
        const list = document.getElementById('event-list'); list.innerHTML = ''; const dayEvents = events[dateStr] || [];
        if (dayEvents.length === 0) { list.innerHTML = '<div style="text-align:center; color:#8E8E93; padding: 40px 0; font-size: 0.9em;">No events</div>'; return; }
        
        dayEvents.sort((a, b) => a.time.localeCompare(b.time)).forEach(ev => {
            const typeClass = ev.type || 'normal'; 
            list.innerHTML += `
                <div class="ios-event-item">
                    <div class="ios-event-time">${ev.time}</div>
                    <div class="ios-event-line ${typeClass}"></div>
                    <div class="ios-event-content">
                        <div class="ios-event-title">${ev.title}</div>
                        <button onclick="deleteEvent('${dateStr}', '${ev.id}')" style="background:none; border:none; color:#FF3B30; font-size:0.8em; cursor:pointer; padding:0;">Delete</button>
                    </div>
                </div>
            `;
        });
    }
    function showAddEventModal() {
        const typeInput = prompt("请选择类型：\n1. 普通日程\n2. 生理期\n3. 约定日", "1"); if (!typeInput) return;
        let type = 'normal'; let defaultTitle = ''; if (typeInput === '2') { type = 'period'; defaultTitle = '生理期开始'; } else if (typeInput === '3') { type = 'appointment'; defaultTitle = '重要约定'; }
        const title = prompt("请输入内容：", defaultTitle); if (!title) return; const time = prompt("请输入时间 (例如 14:30)：", "09:00"); if (!time) return;
        const dateStr = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, '0')}-${String(selDate.getDate()).padStart(2, '0')}`;
        if (!events[dateStr]) events[dateStr] = []; events[dateStr].push({ id: Date.now().toString(), time, title, type, notified: false });
        if (type === 'period') { let nextDate = new Date(selDate); nextDate.setDate(nextDate.getDate() + 28); const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`; if (!events[nextDateStr]) events[nextDateStr] = []; events[nextDateStr].push({ id: Date.now().toString(), time: '09:00', title: '预测生理期', type: 'period', notified: false }); alert("已自动为您预测下一次生理期（28天后）。"); }
        localStorage.setItem('os_events', JSON.stringify(events)); renderCalendar();
    }
    function deleteEvent(dateStr, id) { if (confirm("确定删除此日程吗？")) { events[dateStr] = events[dateStr].filter(e => e.id !== id); localStorage.setItem('os_events', JSON.stringify(events)); renderCalendar(); } }

    // Settings & Init
    function toggleSettings() { 
        const modal = document.getElementById('settingsModal'); 
        modal.classList.toggle('show'); 
        if(modal.classList.contains('show')) {
            loadSettingsToForm(); 
            closeSettingsSubpage(); // Reset to main menu
        }
    }
    function openSettingsSubpage(id) { document.getElementById('settings-subpage-' + id).classList.add('show'); }
    function closeSettingsSubpage() { document.querySelectorAll('.settings-subpage').forEach(el => el.classList.remove('show')); }
    
    function toggleChatMode() { isOnlineMode = !document.getElementById('chat-mode-switch').checked; }
    function toggleFabVisibility() { const isChecked = document.getElementById('fab-toggle').checked; localStorage.setItem('os_showFab', isChecked); document.getElementById('draggable-fab').style.display = isChecked ? 'flex' : 'none'; }
    function loadSettingsToForm() {
        const s = getSettings(); document.getElementById('apiUrl').value = s.apiUrl; document.getElementById('apiKey').value = s.apiKey;
        const select = document.getElementById('apiModelSelect'); if(!Array.from(select.options).some(opt => opt.value === s.apiModel)) { const opt = document.createElement('option'); opt.value = s.apiModel; opt.textContent = s.apiModel; select.appendChild(opt); } select.value = s.apiModel;
        document.getElementById('temperature').value = s.temperature; document.getElementById('tempValue').textContent = s.temperature;
        document.getElementById('autoExtractThreshold').value = s.autoExtractThreshold;
        document.getElementById('charName').value = s.charName; document.getElementById('charPersona').value = s.charPersona; document.getElementById('userPersona').value = s.userPersona;
        document.getElementById('chatBg').value = s.chatBg; document.getElementById('desktopBg').value = s.desktopBg; document.getElementById('charAvatar').value = s.charAvatar; document.getElementById('userAvatar').value = s.userAvatar;
        document.getElementById('bubbleUserBg').value = s.bubbleUserBg; document.getElementById('bubbleUserColor').value = s.bubbleUserColor; document.getElementById('bubbleAiBg').value = s.bubbleAiBg; document.getElementById('bubbleAiColor').value = s.bubbleAiColor;
        document.getElementById('chat-mode-switch').checked = !isOnlineMode; document.getElementById('fab-toggle').checked = s.showFab;
    }
    function saveSettings() {
        let rawUrl = document.getElementById('apiUrl').value.trim();
        if (rawUrl && !rawUrl.includes('/chat/completions')) { if (rawUrl.endsWith('/')) rawUrl = rawUrl.slice(0, -1); if (rawUrl.endsWith('/v1')) rawUrl += '/chat/completions'; else rawUrl += '/v1/chat/completions'; document.getElementById('apiUrl').value = rawUrl; }
        localStorage.setItem('os_apiUrl', rawUrl); localStorage.setItem('os_apiKey', document.getElementById('apiKey').value.trim()); localStorage.setItem('os_apiModel', document.getElementById('apiModelSelect').value); localStorage.setItem('os_temperature', document.getElementById('temperature').value);
        localStorage.setItem('os_autoExtractThreshold', document.getElementById('autoExtractThreshold').value);
        localStorage.setItem('os_charName', document.getElementById('charName').value); localStorage.setItem('os_charPersona', document.getElementById('charPersona').value); localStorage.setItem('os_userPersona', document.getElementById('userPersona').value);
        const bg = document.getElementById('chatBg').value; if(bg) localStorage.setItem('os_chatBg', bg); const dBg = document.getElementById('desktopBg').value; if(dBg) localStorage.setItem('os_desktopBg', dBg); const cAv = document.getElementById('charAvatar').value; if(cAv) localStorage.setItem('os_charAvatar', cAv); const uAv = document.getElementById('userAvatar').value; if(uAv) localStorage.setItem('os_userAvatar', uAv);
        localStorage.setItem('os_bubbleUserBg', document.getElementById('bubbleUserBg').value); localStorage.setItem('os_bubbleUserColor', document.getElementById('bubbleUserColor').value); localStorage.setItem('os_bubbleAiBg', document.getElementById('bubbleAiBg').value); localStorage.setItem('os_bubbleAiColor', document.getElementById('bubbleAiColor').value);
        applyCustomStyles(); toggleSettings(); alert('设置已保存！');
        syncToBackend();
    }
    function applyCustomStyles() {
        const s = getSettings(); if (s.chatBg) document.getElementById('view-chat').style.backgroundImage = `url('${s.chatBg}')`;
        if (s.desktopBg) { document.body.style.backgroundImage = `url('${s.desktopBg}')`; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundPosition = 'center'; } else { document.body.style.backgroundImage = 'none'; document.body.style.backgroundColor = 'var(--bg-color)'; }
        document.documentElement.style.setProperty('--bubble-user-bg', s.bubbleUserBg); document.documentElement.style.setProperty('--bubble-user-color', s.bubbleUserColor); document.documentElement.style.setProperty('--bubble-ai-bg', s.bubbleAiBg); document.documentElement.style.setProperty('--bubble-ai-color', s.bubbleAiColor);
        document.getElementById('chat-title-text').textContent = s.charName; document.getElementById('fab-text').textContent = s.charName + '召唤'; if (s.charAvatar) document.getElementById('chat-header-avatar').src = s.charAvatar; document.getElementById('draggable-fab').style.display = s.showFab ? 'flex' : 'none'; renderChatHistory();
        
        // Apply custom icons
        const customIcons = JSON.parse(localStorage.getItem('os_custom_icons') || '{}');
        for (const [id, src] of Object.entries(customIcons)) {
            const el = document.getElementById(id);
            if (el) {
                el.style.backgroundImage = `url('${src}')`;
                el.innerHTML = ''; // Remove default icon
            }
        }
    }
    
    let currentIconTarget = null;
    function triggerIconUpload(targetId) {
        currentIconTarget = targetId;
        document.getElementById('icon-upload-input').click();
    }
    
    function handleIconUpload(event) {
        const file = event.target.files[0];
        if (file && currentIconTarget) {
            const reader = new FileReader();
            reader.onload = function(e) {
                compressImage(e.target.result, 200, (compressed) => {
                    const customIcons = JSON.parse(localStorage.getItem('os_custom_icons') || '{}');
                    customIcons[currentIconTarget] = compressed;
                    localStorage.setItem('os_custom_icons', JSON.stringify(customIcons));
                    applyCustomStyles();
                    syncToBackend();
                });
            };
            reader.readAsDataURL(file);
        }
        event.target.value = ''; // Reset input
    }
    function saveChatHistory() { if (chatHistory.length > 100) chatHistory = chatHistory.slice(-100); localStorage.setItem('os_chatHistory', JSON.stringify(chatHistory)); syncToBackend(); }
    function loadChatHistory() { const saved = localStorage.getItem('os_chatHistory'); if (saved) chatHistory = JSON.parse(saved); }
    function compressImage(dataUrl, maxWidth, callback) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width; let height = img.height;
            if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    }

    function handleImageUpload(event, targetId) { 
        const file = event.target.files[0]; 
        if (file) { 
            const reader = new FileReader(); 
            reader.onload = function(e) { 
                compressImage(e.target.result, 1080, (compressed) => {
                    document.getElementById(targetId).value = compressed; 
                });
            }; 
            reader.readAsDataURL(file); 
        } 
    }
    async function testConnection() {
        let url = document.getElementById('apiUrl').value.trim(); const key = document.getElementById('apiKey').value.trim(); const select = document.getElementById('apiModelSelect');
        if (!url || !key) return alert("请填写 URL 和 Key");
        if (!url.includes('/chat/completions')) { if (url.endsWith('/')) url = url.slice(0, -1); if (url.endsWith('/v1')) url += '/chat/completions'; else url += '/v1/chat/completions'; document.getElementById('apiUrl').value = url; }
        try { 
            let baseUrl = url.split('/chat/completions')[0]; 
            const res = await fetch(`${baseUrl}/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
            const data = await res.json(); 
            if (data.data) { 
                select.innerHTML = ''; 
                data.data.forEach(m => { const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.id; select.appendChild(opt); }); 
                alert("连接成功！已刷新模型列表。\n\n⚠️ 请务必点击底部的【保存设置】按钮，否则聊天时会报错！"); 
            } else { 
                alert("连接成功，但未获取到模型列表。\n\n⚠️ 请务必点击底部的【保存设置】按钮，否则聊天时会报错！"); 
            } 
        } catch (e) { 
            alert("连接失败，请检查 URL 和 Key 是否正确，或是否存在跨域问题。"); 
        }
    }
    async function generateAIContent(prompt, elementId) {
        const s = getSettings(); if (!s.apiUrl || !s.apiKey) return;
        let fetchUrl = s.apiUrl; if (!fetchUrl.includes('/chat/completions')) { if (fetchUrl.endsWith('/')) fetchUrl = fetchUrl.slice(0, -1); if (fetchUrl.endsWith('/v1')) fetchUrl += '/chat/completions'; else fetchUrl += '/v1/chat/completions'; }
        const el = document.getElementById(elementId); const originalText = el.innerHTML; el.innerHTML = "生成中...";
        try { const response = await fetch(fetchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` }, body: JSON.stringify({ model: s.apiModel, messages: [{ role: 'user', content: prompt }], temperature: parseFloat(s.temperature) }) }); const data = await response.json(); if (data.choices && data.choices.length > 0) { let text = data.choices[0].message.content.trim(); text = text.replace(/^["'「『]|["'」』]$/g, "").trim(); el.innerHTML = text; localStorage.setItem('os_text_' + elementId, text); } else el.innerHTML = originalText; } catch (e) { el.innerHTML = originalText; }
    }

    // FAB Drag Logic
    const fab = document.getElementById('draggable-fab'); let isDraggingFab = false; let fabStartX, fabStartY, initialFabLeft, initialFabTop;
    function startFabDrag(clientX, clientY) { isDraggingFab = false; fabStartX = clientX; fabStartY = clientY; const rect = fab.getBoundingClientRect(); initialFabLeft = rect.left; initialFabTop = rect.top; }
    function moveFabDrag(clientX, clientY, e) { const dx = clientX - fabStartX; const dy = clientY - fabStartY; if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { isDraggingFab = true; if(e) e.preventDefault(); fab.style.left = `${initialFabLeft + dx}px`; fab.style.top = `${initialFabTop + dy}px`; fab.style.bottom = 'auto'; fab.style.right = 'auto'; } }
    function endFabDrag() { if (!isDraggingFab) triggerEmergencyScold(); }
    fab.addEventListener('touchstart', (e) => startFabDrag(e.touches[0].clientX, e.touches[0].clientY), {passive: true}); fab.addEventListener('touchmove', (e) => moveFabDrag(e.touches[0].clientX, e.touches[0].clientY, e), {passive: false}); fab.addEventListener('touchend', endFabDrag);
    fab.addEventListener('mousedown', (e) => { startFabDrag(e.clientX, e.clientY); function onMouseMove(moveEvent) { moveFabDrag(moveEvent.clientX, moveEvent.clientY, moveEvent); } function onMouseUp() { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); endFabDrag(); } document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); });

    // Mini Chat Logic
    function closeMiniChat() { document.getElementById('miniChatWindow').classList.remove('show'); }
    async function triggerEmergencyScold() {
        const win = document.getElementById('miniChatWindow'); win.classList.add('show'); win.style.left = (window.innerWidth - win.offsetWidth) / 2 + 'px'; win.style.top = (window.innerHeight - win.offsetHeight) / 2 + 'px';
        renderMiniChatHistory();
        chatHistory.push({ role: 'user', content: "【紧急召唤】主人现在很生气或者遇到麻烦了！快出来挨骂并解决问题！解决完问题之后可以根据人设讨要奖励。", timestamp: Date.now() }); saveChatHistory(); renderChatHistory(); renderMiniChatHistory();
        const body = document.getElementById('miniChatBody'); const typingDiv = document.createElement('div'); typingDiv.className = 'mini-msg ai typing-msg-mini'; typingDiv.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>'; body.appendChild(typingDiv); body.scrollTop = body.scrollHeight;
        await requestAIResponse(); const t = document.querySelector('.typing-msg-mini'); if(t) t.remove();
    }
    function renderMiniChatHistory() { const body = document.getElementById('miniChatBody'); body.innerHTML = ''; const recent = chatHistory.slice(-10); if(recent.length === 0) { body.innerHTML = '<div class="mini-msg ai">汪！主人找我吗？</div>'; } else { recent.forEach(msg => { const div = document.createElement('div'); div.className = `mini-msg ${msg.role === 'assistant' ? 'ai' : 'user'}`; div.textContent = msg.content; body.appendChild(div); }); } body.scrollTop = body.scrollHeight; }
    async function sendMiniMessage() { const input = document.getElementById('miniChatInput'); const text = input.value.trim(); if (!text) return; input.value = ''; chatHistory.push({ role: 'user', content: text, timestamp: Date.now() }); saveChatHistory(); renderChatHistory(); renderMiniChatHistory(); const body = document.getElementById('miniChatBody'); const typingDiv = document.createElement('div'); typingDiv.className = 'mini-msg ai typing-msg-mini'; typingDiv.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>'; body.appendChild(typingDiv); body.scrollTop = body.scrollHeight; await requestAIResponse(); const t = document.querySelector('.typing-msg-mini'); if(t) t.remove(); }

    // Init
    async function initApp() {
        document.querySelectorAll('.editable').forEach(el => { el.setAttribute('contenteditable', 'true'); });
        loadEditableTexts(); 
        renderGallery(); 
        loadChatHistory(); 
        applyCustomStyles(); 
        
        loadHealthDataForDate();
        MemorySystem.dailyOrganize(false); // Auto organize on load if needed
        
        isAppInitialized = true;
    }
    
    initApp();
