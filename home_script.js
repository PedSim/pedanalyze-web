/////////////////////


document.addEventListener('DOMContentLoaded', () => {
    const projectContainer = document.getElementById('projectContainer');
    const createNewProjectBtn = document.getElementById('createNewProject');

    const openMergerButton = document.getElementById('openMerger');
    openMergerButton.addEventListener('click', () => {
        window.location.href = 'merger.html';
    });
  
    const loadProjectButton = document.getElementById('load-json-file');
    loadProjectButton.addEventListener('click', () => {
        document.getElementById('json1-file').click();
    });
  
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

    // Add event listener for file input change
    document.getElementById('json1-file').addEventListener('change', loadJSONFile);

    let projects = JSON.parse(localStorage.getItem('projects')) || [];

    projectContainer.innerHTML = '';

    projects.forEach(project => {
        const newCard = createProjectCard(project.projectName, project.videoTitle, project.videoLink);
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

    function createProjectCard(projectName, videoTitle, videoLink) {
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
                window.location.href = `ontology.html?video=${encodeURIComponent(videoLink)}&projectName=${encodeURIComponent(projectName)}`;
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
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const confirmation = confirm('Are you sure you want to delete this project?');
            if (confirmation) {
                deleteProject(projectName);
                projectContainer.removeChild(card);
            }
        });

        return card;
    }

    function deleteProject(projectName) {
        projects = projects.filter(project => project.projectName !== projectName);
        localStorage.setItem('projects', JSON.stringify(projects));
    }

    createNewProjectBtn.addEventListener('click', async () => {
        const projectNameInput = document.getElementById('projectName');
        const videoLinkInput = document.getElementById('videoLink');

        const projectName = projectNameInput.value.trim();
        const videoLink = videoLinkInput.value.trim();
        const videoId = getYouTubeVideoId(videoLink);

        if (projectName && videoId) {
            const videoTitle = await getYouTubeVideoTitle(videoId);
            const newProject = { projectName, videoTitle, videoLink };

            projects.push(newProject);

            localStorage.setItem('projects', JSON.stringify(projects));

            const newCard = createProjectCard(projectName, videoTitle, videoLink);
            projectContainer.appendChild(newCard);

            projectNameInput.value = '';
            videoLinkInput.value = '';
        } else {
            alert('Please enter a valid project name and YouTube video link.');
        }
    });
});
