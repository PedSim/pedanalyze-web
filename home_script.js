/////////////////////


document.addEventListener('DOMContentLoaded', () => {
    const projectContainer = document.getElementById('projectContainer');
    const createNewProjectBtn = document.getElementById('createNewProject');
    const createNewProjectUploadBtn = document.getElementById('createNewProjectUpload');
    const uploadProjectNameInput = document.getElementById('projectName_upload');
    const UPLOAD_DB_NAME = 'PedAnalyzeUploads';
    const UPLOAD_STORE_NAME = 'videos';
    let uploadedVideoFile = null;
    const DEFAULT_FPS = 30;

    const openMergerButton = document.getElementById('openMerger');
    openMergerButton.addEventListener('click', () => {
        window.location.href = 'merger.html';
    });
  
    const loadProjectButton = document.getElementById('load-json-file');
    loadProjectButton.addEventListener('click', () => {
        document.getElementById('json1-file').click();
    });

    function setJsonImportStatus({ type, title, message, details }) {
        const el = document.getElementById('json-import-status');
        if (!el) {
            if (type === 'error') {
                alert([title, message, details].filter(Boolean).join('\n\n'));
            }
            return;
        }

        const palette = {
            info: { bg: '#ffffff', border: '#94a3b8', text: '#0f172a' },
            success: { bg: '#ecfdf5', border: '#10b981', text: '#064e3b' },
            warning: { bg: '#fffbeb', border: '#f59e0b', text: '#78350f' },
            error: { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d' }
        };

        const colors = palette[type] || palette.info;
        el.style.display = 'block';
        el.style.background = colors.bg;
        el.style.border = `1px solid ${colors.border}`;
        el.style.color = colors.text;
        el.style.borderRadius = '8px';
        el.style.padding = '10px 12px';
        el.style.lineHeight = '1.35';
        el.style.whiteSpace = 'pre-wrap';

        const parts = [];
        if (title) parts.push(title);
        if (message) parts.push(message);
        if (details) parts.push(details);
        el.textContent = parts.join('\n\n');
    }

    function clearJsonImportStatus() {
        const el = document.getElementById('json-import-status');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
    }

    function resetJsonFileInput() {
        const jsonFileInput = document.getElementById('json1-file');
        if (jsonFileInput) jsonFileInput.value = '';
    }
  
    function openUploadDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(UPLOAD_DB_NAME, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(UPLOAD_STORE_NAME)) {
                    db.createObjectStore(UPLOAD_STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveUploadedVideoRecord(id, file) {
        const db = await openUploadDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(UPLOAD_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(UPLOAD_STORE_NAME);

            store.put({
                id,
                file,
                name: file.name,
                type: file.type,
                lastModified: file.lastModified
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function deleteUploadedVideoRecord(id) {
        if (!id) {
            return;
        }

        const db = await openUploadDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(UPLOAD_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(UPLOAD_STORE_NAME);

            store.delete(id);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    function safeJsonParse(text, filenameForError) {
        try {
            return { ok: true, value: JSON.parse(text) };
        } catch (err) {
            return { ok: false, error: `Failed to parse JSON${filenameForError ? ` (${filenameForError})` : ''}.` };
        }
    }

    function flattenTagDefinitions(definitionsJson) {
        const out = [];

        function walk(node) {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach(item => {
                    if (item && typeof item === 'object' && item['tag-id'] && item.display) {
                        out.push(item);
                    }
                });
                return;
            }
            if (typeof node === 'object') {
                Object.values(node).forEach(walk);
            }
        }

        walk(definitionsJson);
        return out;
    }

    async function buildTagLookup() {
        const [ped, vehicle, env, archetypes] = await Promise.all([
            fetch('./ped_tags.json').then(r => r.json()),
            fetch('./vehicle_tags.json').then(r => r.json()),
            fetch('./environment_tags.json').then(r => r.json()),
            fetch('./archetypes.json').then(r => r.json())
        ]);

        function toMap(json) {
            const map = {};
            flattenTagDefinitions(json).forEach(tag => {
                map[tag['tag-id']] = tag.display;
            });
            return map;
        }

        return {
            ped: toMap(ped),
            ego: toMap(vehicle),
            scene: toMap(env),
            archetype: toMap(archetypes)
        };
    }

    function toInternalTagPairs(tagIds, lookupMap) {
        if (!Array.isArray(tagIds)) return [];
        return tagIds
            .filter(Boolean)
            .map(tagId => [tagId, lookupMap[tagId] || tagId]);
    }

    function normalizeImportedProjectJson(raw, lookups) {
        if (!raw || typeof raw !== 'object') {
            return { ok: false, error: 'Invalid JSON format (expected an object at root).' };
        }

        const videoPath = raw.video_path;
        if (!videoPath || typeof videoPath !== 'string') {
            return { ok: false, error: 'Invalid JSON: missing `video_path`.' };
        }

        const fps = Number(raw.fps) || DEFAULT_FPS;
        const multi = Array.isArray(raw.multiFrameAnnotations) ? raw.multiFrameAnnotations : [];
        const single = Array.isArray(raw.singleFrameAnnotations) ? raw.singleFrameAnnotations : [];

        const normalizedMulti = multi.map(a => ({
            frameStart: Number(a.frameStart) || 0,
            frameEnd: Number(a.frameEnd) || 0,
            pedTags: toInternalTagPairs(a.pedTags, lookups.ped),
            egoTags: toInternalTagPairs(a.egoTags, lookups.ego),
            sceneTags: toInternalTagPairs(a.sceneTags, lookups.scene),
            archetypeTags: toInternalTagPairs(a.archetypeTags, lookups.archetype),
            notes: a.additionalNotes || a.notes || ''
        }));

        const normalizedSingle = single.map(a => ({
            frame: Number(a.frame) || 0,
            pedTags: toInternalTagPairs(a.pedTags, lookups.ped),
            egoTags: toInternalTagPairs(a.egoTags, lookups.ego),
            sceneTags: toInternalTagPairs(a.sceneTags, lookups.scene),
            archetypeTags: toInternalTagPairs(a.archetypeTags, lookups.archetype),
            notes: a.additionalNotes || a.notes || ''
        }));

        return {
            ok: true,
            value: {
                name: typeof raw.name === 'string' ? raw.name : '',
                video_path: videoPath,
                fps,
                data: {
                    fps,
                    multiFrameAnnotations: normalizedMulti,
                    singleFrameAnnotations: normalizedSingle
                }
            }
        };
    }

    function detectOverlaps(mergedData) {
        const overlaps = [];
        const multi = Array.isArray(mergedData.multiFrameAnnotations) ? mergedData.multiFrameAnnotations : [];
        const single = Array.isArray(mergedData.singleFrameAnnotations) ? mergedData.singleFrameAnnotations : [];

        // Multi-frame overlaps: range intersection
        for (let i = 0; i < multi.length; i++) {
            const a = multi[i];
            const aStart = Number(a.frameStart) || 0;
            const aEnd = Number(a.frameEnd) || 0;
            for (let j = i + 1; j < multi.length; j++) {
                const b = multi[j];
                const bStart = Number(b.frameStart) || 0;
                const bEnd = Number(b.frameEnd) || 0;
                if (aStart <= bEnd && bStart <= aEnd) {
                    overlaps.push({ type: 'multi', aIndex: i, bIndex: j, aRange: [aStart, aEnd], bRange: [bStart, bEnd] });
                }
            }
        }

        // Single-frame overlaps: same frame
        const seen = new Map();
        for (let i = 0; i < single.length; i++) {
            const frame = Number(single[i].frame) || 0;
            const prev = seen.get(frame);
            if (prev !== undefined) {
                overlaps.push({ type: 'single', aIndex: prev, bIndex: i, frame });
            } else {
                seen.set(frame, i);
            }
        }

        return overlaps;
    }

    function showOverlapWarningIfNeeded(mergedData) {
        const overlaps = detectOverlaps(mergedData);
        if (!overlaps.length) return;

        const multiOverlaps = overlaps.filter(o => o.type === 'multi');
        const singleOverlaps = overlaps.filter(o => o.type === 'single');

        const examples = overlaps.slice(0, 12).map(o => {
            if (o.type === 'multi') {
                return `- Multi: #${o.aIndex + 1} (${o.aRange[0]}-${o.aRange[1]}) overlaps #${o.bIndex + 1} (${o.bRange[0]}-${o.bRange[1]})`;
            }
            return `- Single: frame ${o.frame} appears at #${o.aIndex + 1} and #${o.bIndex + 1}`;
        });

        alert(
            [
                'Imported annotations contain overlapping frames/ranges.',
                '',
                `Multi-frame overlaps: ${multiOverlaps.length}`,
                `Single-frame overlaps: ${singleOverlaps.length}`,
                '',
                'Examples:',
                ...examples,
                '',
                'Duplicates were kept. You can review/delete overlaps in the “Show All Annotations” tab.'
            ].join('\n')
        );
    }

    function deriveBaseProjectName(normalizedImports, files) {
        const firstNamed = normalizedImports.find(n => n && n.name)?.name;
        if (firstNamed && typeof firstNamed === 'string' && firstNamed.trim()) {
            return firstNamed.trim();
        }
        const firstFile = (files && files[0] && files[0].name) ? files[0].name : '';
        if (firstFile) {
            return firstFile.replace(/\.json$/i, '');
        }
        return 'Imported Project';
    }

    function makeUniqueProjectName(baseName, existingProjects) {
        const existingNames = new Set((existingProjects || []).map(p => p.projectName));
        if (!existingNames.has(baseName)) return baseName;
        let i = 2;
        while (existingNames.has(`${baseName} (${i})`)) i++;
        return `${baseName} (${i})`;
    }

    async function loadJSONFile() {
        const jsonFileInput = document.getElementById('json1-file');
        const files = Array.from(jsonFileInput.files || []);

        if (!files.length) {
            setJsonImportStatus({
                type: 'warning',
                title: 'No file selected',
                message: 'Please select one or more JSON files to import.'
            });
            return;
        }

        clearJsonImportStatus();
        setJsonImportStatus({
            type: 'info',
            title: 'Importing JSON…',
            message: `Reading ${files.length} file${files.length === 1 ? '' : 's'}…`
        });

        let lookups;
        try {
            lookups = await buildTagLookup();
        } catch (e) {
            console.error(e);
            setJsonImportStatus({
                type: 'error',
                title: 'Import failed',
                message: 'Failed to load tag definitions needed to import this JSON.',
                details: 'Please refresh the page and try again.'
            });
            resetJsonFileInput();
            return;
        }

        const parsedRaw = await Promise.all(files.map(file => new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve({ file, text: e.target.result });
            reader.onerror = () => resolve({ file, error: `Failed to read file (${file.name}).` });
            reader.readAsText(file);
        })));

        const normalized = [];
        for (const item of parsedRaw) {
            if (item.error) {
                setJsonImportStatus({
                    type: 'error',
                    title: 'Import failed',
                    message: item.error
                });
                resetJsonFileInput();
                return;
            }

            const parsed = safeJsonParse(item.text, item.file.name);
            if (!parsed.ok) {
                setJsonImportStatus({
                    type: 'error',
                    title: 'Import failed',
                    message: parsed.error
                });
                resetJsonFileInput();
                return;
            }

            const norm = normalizeImportedProjectJson(parsed.value, lookups);
            if (!norm.ok) {
                setJsonImportStatus({
                    type: 'error',
                    title: 'Import failed',
                    message: norm.error,
                    details: `File: ${item.file.name}`
                });
                resetJsonFileInput();
                return;
            }

            normalized.push(norm.value);
        }

        const videoPath = normalized[0].video_path;
        const mismatch = normalized.find(n => n.video_path !== videoPath);
        if (mismatch) {
            const fileVideoPairs = normalized
                .map((n, idx) => {
                    const fname = (files[idx] && files[idx].name) ? files[idx].name : `File ${idx + 1}`;
                    return `- ${fname}: ${n.video_path}`;
                })
                .join('\n');

            setJsonImportStatus({
                type: 'error',
                title: 'Import canceled: different videos detected',
                message: 'To combine multiple JSON files, they must all reference the same YouTube link in `video_path`.',
                details: `Detected:\n${fileVideoPairs}`
            });
            resetJsonFileInput();
            return;
        }

        setJsonImportStatus({
            type: 'info',
            title: 'Importing JSON…',
            message: 'Combining annotations and checking overlaps…'
        });

        const mergedData = {
            fps: normalized[0].fps || DEFAULT_FPS,
            multiFrameAnnotations: normalized.flatMap(n => n.data.multiFrameAnnotations || []),
            singleFrameAnnotations: normalized.flatMap(n => n.data.singleFrameAnnotations || [])
        };

        showOverlapWarningIfNeeded(mergedData);

        const projectsInStorage = JSON.parse(localStorage.getItem('projects')) || [];
        const baseName = deriveBaseProjectName(normalized, files);
        const finalProjectName = makeUniqueProjectName(baseName, projectsInStorage);

        const videoId = getYouTubeVideoId(videoPath);
        let videoTitle = 'Imported project';
        if (videoId) {
            try {
                videoTitle = await getYouTubeVideoTitle(videoId);
            } catch (e) {
                console.warn('Failed to fetch YouTube title for import:', e);
            }
        }

        const newProject = {
            projectName: finalProjectName,
            videoTitle,
            videoLink: videoPath,
            videoType: 'youtube',
            data: mergedData
        };

        projectsInStorage.push(newProject);
        localStorage.setItem('projects', JSON.stringify(projectsInStorage));

        setJsonImportStatus({
            type: 'success',
            title: 'Import successful',
            message: `Created project "${finalProjectName}". Opening it now…`
        });

        resetJsonFileInput();

        window.location.href = buildProjectUrl(newProject);
    }

    // ---------------- DRAG & DROP UPLOAD LOGIC ----------------
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("video-file-input");

    // Click to open file dialog
    dropZone.addEventListener("click", () => fileInput.click());

    // When file is selected normally
    fileInput.addEventListener("change", () => {
        handleFile(fileInput.files[0]);
    });

    // Drag over styling
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    // Remove styling when leaving
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    // Drop file
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");

        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    // File handler
    function handleFile(file) {
        if (!file) return;

        if (!file.type.startsWith('video/')) {
            alert('Please upload a valid video file.');
            return;
        }

        console.log("Uploaded file:", file);
        uploadedVideoFile = file;
        dropZone.querySelector('p').innerHTML = `${file.name}<br><span class="click-select">Click to Select Another File</span>`;
    }

    // Add event listener for file input change
    document.getElementById('json1-file').addEventListener('change', loadJSONFile);

    let projects = JSON.parse(localStorage.getItem('projects')) || [];

    projectContainer.innerHTML = '';

    projects.forEach(project => {
        const newCard = createProjectCard(project);
        projectContainer.appendChild(newCard);
    });

    async function getYouTubeVideoTitle(videoId) {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const data = await response.json();
        return data.title || 'Unknown Title';
    }

    function getYouTubeVideoId(url) {
        const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/\\n\\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"'>\\s]+)/;
        const match = url.match(regExp);
        return (match && match[1]) ? match[1] : null;
    }

    function downloadJSON(data, filename) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function buildProjectUrl(project) {
        const params = new URLSearchParams({
            projectName: project.projectName
        });

        if (project.videoType === 'upload') {
            params.set('videoType', 'upload');
            if (project.uploadedVideoId) {
                params.set('uploadedVideoId', project.uploadedVideoId);
            }
        } else if (project.videoLink) {
            params.set('video', project.videoLink);
        }

        return `ontology.html?${params.toString()}`;
    }

    function createProjectCard(project) {
        const { projectName, videoTitle } = project;
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <div class="project-title">${projectName}</div>
            <div class="project-subtitle">${videoTitle}</div>
            <button class="download-btn">Download Data</button>
            <button class="delete-btn">Delete Project</button>
        `;

        card.addEventListener('click', (event) => {
            if (!event.target.classList.contains('download-btn') && !event.target.classList.contains('delete-btn')) {
                window.location.href = buildProjectUrl(project);
            }
        });

        const downloadBtn = card.querySelector('.download-btn');
        downloadBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const projects = JSON.parse(localStorage.getItem('projects')) || [];
            const project = projects.find(p => p.projectName === projectName);
            if (project && project.data) {
                const multiFrameCount = project.data.multiFrameAnnotations ? project.data.multiFrameAnnotations.length : 0;
                const singleFrameCount = project.data.singleFrameAnnotations ? project.data.singleFrameAnnotations.length : 0;
                
                const fullData = {
                    name: projectName,
                    fps: project.data.fps,
                    video_path: project.videoLink,
                    numberOfSingleFrameAnnotations: singleFrameCount,
                    numberOfMultiFrameAnnotations: multiFrameCount,
                    multiFrameAnnotations: project.data.multiFrameAnnotations.map(a => ({
                        frameStart: a.frameStart,
                        frameEnd: a.frameEnd,
                        pedTags: a.pedTags,
                        egoTags: a.egoTags,
                        sceneTags: a.sceneTags,
                        additionalNotes: a.notes || a.additionalNotes || ""
                    })),
                    singleFrameAnnotations: project.data.singleFrameAnnotations.map(a => ({
                        frame: a.frame,
                        pedTags: a.pedTags,
                        egoTags: a.egoTags,
                        sceneTags: a.sceneTags,
                        additionalNotes: a.notes || a.additionalNotes || ""
                    }))
                };
                downloadJSON(fullData, `${projectName}_annotations.json`);
            } else {
                alert('No annotation data available for this project.');
            }
        });

        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const confirmation = confirm('Are you sure you want to delete this project?');
            if (confirmation) {
                await deleteProject(project);
                projectContainer.removeChild(card);
            }
        });

        return card;
    }

    async function deleteProject(projectToDelete) {
        projects = projects.filter(project => project.projectName !== projectToDelete.projectName);
        localStorage.setItem('projects', JSON.stringify(projects));

        if (projectToDelete.videoType === 'upload') {
            try {
                await deleteUploadedVideoRecord(projectToDelete.uploadedVideoId);
            } catch (error) {
                console.error('Failed to delete uploaded video record:', error);
            }
        }
    }

    createNewProjectBtn.addEventListener('click', async () => {
        const projectNameInput = document.getElementById('projectName');
        const videoLinkInput = document.getElementById('videoLink');

        const projectName = projectNameInput.value.trim();
        const videoLink = videoLinkInput.value.trim();
        const videoId = getYouTubeVideoId(videoLink);

        if (projectName && videoId) {
            const videoTitle = await getYouTubeVideoTitle(videoId);
            const newProject = { projectName, videoTitle, videoLink, videoType: 'youtube' };

            projects.push(newProject);

            localStorage.setItem('projects', JSON.stringify(projects));

            const newCard = createProjectCard(newProject);
            projectContainer.appendChild(newCard);

            projectNameInput.value = '';
            videoLinkInput.value = '';

            // Auto-open newly created project
            window.location.href = buildProjectUrl(newProject);
        } else {
            alert('Please enter a valid project name and YouTube video link.');
        }
    });

    createNewProjectUploadBtn.addEventListener('click', async () => {
        const projectName = uploadProjectNameInput.value.trim();

        if (!projectName || !uploadedVideoFile) {
            alert('Please enter a project name and upload a video file.');
            return;
        }

        const uploadedVideoId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const newProject = {
            projectName,
            videoTitle: uploadedVideoFile.name,
            videoLink: uploadedVideoFile.name,
            videoType: 'upload',
            uploadedVideoId
        };

        try {
            await saveUploadedVideoRecord(uploadedVideoId, uploadedVideoFile);
            projects.push(newProject);
            localStorage.setItem('projects', JSON.stringify(projects));

            const newCard = createProjectCard(newProject);
            projectContainer.appendChild(newCard);

            uploadProjectNameInput.value = '';
            fileInput.value = '';
            uploadedVideoFile = null;
            dropZone.querySelector('p').innerHTML = 'Drag & Drop Video Here<br><span class="click-select">Click to Select</span>';

            // Auto-open newly created upload project
            window.location.href = buildProjectUrl(newProject);
        } catch (error) {
            console.error('Failed to save uploaded video:', error);
            alert('There was a problem saving the uploaded video. Please try again.');
        }
    });
});
