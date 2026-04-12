/////////////////////


document.addEventListener('DOMContentLoaded', () => {
    const projectContainer = document.getElementById('projectContainer');
    const createNewProjectBtn = document.getElementById('createNewProject');
    const createNewProjectUploadBtn = document.getElementById('createNewProjectUpload');
    const uploadProjectNameInput = document.getElementById('projectName_upload');
    const UPLOAD_DB_NAME = 'PedAnalyzeUploads';
    const UPLOAD_STORE_NAME = 'videos';
    let uploadedVideoFile = null;

    const openMergerButton = document.getElementById('openMerger');
    openMergerButton.addEventListener('click', () => {
        window.location.href = 'merger.html';
    });
  
    const loadProjectButton = document.getElementById('load-json-file');
    loadProjectButton.addEventListener('click', () => {
        document.getElementById('json1-file').click();
    });
  
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

    function loadJSONFile() {
        const jsonFileInput = document.getElementById('json1-file');
        const jsonFile = jsonFileInput.files[0];

        if (jsonFile) {
            const jsonReader = new FileReader();

            jsonReader.onload = (e) => {
                const jsonData = JSON.parse(e.target.result);
                // You can add more processing here
            };

            jsonReader.readAsText(jsonFile);
        } else {
            alert('Please select a JSON file.');
        }
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
        } catch (error) {
            console.error('Failed to save uploaded video:', error);
            alert('There was a problem saving the uploaded video. Please try again.');
        }
    });
});
