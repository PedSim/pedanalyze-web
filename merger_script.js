let player;
let mergedAnnotations = [];
let tagCategories = {};

document.addEventListener('DOMContentLoaded', () => {
    const videoPlayer = document.getElementById('video-player');
    const frameCount = document.getElementById('frame-count');
    const currentFrameSlider = document.getElementById('current-frame');
    const saveMergedAnnotationsButton = document.getElementById('save-merged-annotations');
    const json1AnnotationsContainer = document.getElementById('json1-annotations-container');
    const json2AnnotationsContainer = document.getElementById('json2-annotations-container');

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-pane');
    const jsonUploadModal = document.getElementById('json-upload-modal');
    const loadJsonFilesButton = document.getElementById('load-json-files');

    jsonUploadModal.style.display = 'block';

    loadJsonFilesButton.addEventListener('click', loadJsonFiles);
    saveMergedAnnotationsButton.addEventListener('click', saveMergedAnnotations);

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`${tabName}-content`).classList.add('active');
        });
    });

    function loadJsonFiles() {
        const json1FileInput = document.getElementById('json1-file');
        const json2FileInput = document.getElementById('json2-file');
        const json1File = json1FileInput.files[0];
        const json2File = json2FileInput.files[0];

        if (json1File && json2File) {
            const json1Reader = new FileReader();
            const json2Reader = new FileReader();

            json1Reader.onload = (e) => {
                const json1Data = JSON.parse(e.target.result);
                validateAndProcessJsonData(json1Data, 1);
            };

            json2Reader.onload = (e) => {
                const json2Data = JSON.parse(e.target.result);
                validateAndProcessJsonData(json2Data, 2);
            };

            json1Reader.readAsText(json1File);
            json2Reader.readAsText(json2File);

            jsonUploadModal.style.display = 'none';
        } else {
            alert('Please select both JSON files.');
        }
    }

    function validateAndProcessJsonData(data, jsonNumber) {
        if (mergedAnnotations.length === 0) {
            mergedAnnotations.push(data);
            if (jsonNumber === 1) {
                loadVideoFromJson(data.video_path);
            }
        } else {
            if (data.video_path !== mergedAnnotations[0].video_path) {
                alert('The JSON files are not for the same video.');
                jsonUploadModal.style.display = 'block';
                mergedAnnotations = [];
            } else {
                mergedAnnotations.push(data);
            }
        }

        if (jsonNumber === 1) {
            displayAnnotations(data.multiFrameAnnotations, json1AnnotationsContainer, jsonNumber);
        } else if (jsonNumber === 2) {
            displayAnnotations(data.multiFrameAnnotations, json2AnnotationsContainer, jsonNumber);
        }
    }

    function displayAnnotations(annotations, container, jsonNumber) {
        container.innerHTML = '';
        annotations.forEach((annotation, index) => {
            const pedTags = annotation.pedTags || [];
            const vehicleTags = annotation.vehicleTags || [];
            const environmentTags = annotation.environmentTags || [];
            const archetypeTags = annotation.archetypeTags || [];

            const annotationDiv = document.createElement('div');
            annotationDiv.className = 'annotation';
            annotationDiv.innerHTML = `
                <div class="annotation-details">
                    <div class="annotation-frame">Frame: ${annotation.frameStart} - ${annotation.frameEnd}</div>
                    <div class="annotation-tags">
                        <div class="tag-category">
                            <h4>Pedestrian</h4>
                            ${pedTags.map(tag => `<label><input type="checkbox">${tag}</label>`).join('')}
                        </div>
                        <div class="tag-category">
                            <h4>Vehicle</h4>
                            ${vehicleTags.map(tag => `<label><input type="checkbox">${tag}</label>`).join('')}
                        </div>
                        <div class="tag-category">
                            <h4>Environment</h4>
                            ${environmentTags.map(tag => `<label><input type="checkbox">${tag}</label>`).join('')}
                        </div>
                        <div class="tag-category">
                            <h4>Archetype</h4>
                            ${archetypeTags.map(tag => `<label><input type="checkbox">${tag}</label>`).join('')}
                        </div>
                    </div>
                </div>
                <button class="delete-button" data-json="${jsonNumber}" data-index="${index}">Delete</button>
            `;
            container.appendChild(annotationDiv);
        });

        const deleteButtons = container.querySelectorAll('.delete-button');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const jsonNum = parseInt(e.target.getAttribute('data-json'));
                const index = parseInt(e.target.getAttribute('data-index'));
                deleteAnnotation(jsonNum, index);
            });
        });
    }

    function deleteAnnotation(jsonNumber, index) {
        mergedAnnotations[jsonNumber - 1].multiFrameAnnotations.splice(index, 1);
        const container = jsonNumber === 1 ? json1AnnotationsContainer : json2AnnotationsContainer;
        displayAnnotations(mergedAnnotations[jsonNumber - 1].multiFrameAnnotations, container, jsonNumber);
    }

    function loadVideoFromJson(videoPath) {
        player = new YT.Player('video-player', {
            height: '390',
            width: '640',
            videoId: extractVideoId(videoPath),
            playerVars: {
                controls: 0,
                autoplay: 1 
            },
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange
            }
        });
    }

    function extractVideoId(url) {
        const urlParams = new URLSearchParams(new URL(url).search);
        return urlParams.get('v');
    }

    function onPlayerReady(event) {
    }

    function onPlayerStateChange(event) {
    }

    function saveMergedAnnotations() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mergedAnnotations));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "merged_annotations.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
});
