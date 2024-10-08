let player;
let videoPlayer;
let playPauseButton;
let currentFrameSlider;
let intervalId;
let isVideoLocked = false;
class Recording {
    constructor(videoPath, fps) {
        this.videoPath = videoPath;
        this.fps = fps;
        this.annotations = [];
    }
}
class SingleFrameAnnotation {
    constructor(frame, pedTags, egoTags, sceneTags, archetypeTags, notes) {
        this.frame = frame;
        this.pedTags = pedTags;
        this.egoTags = egoTags;
        this.sceneTags = sceneTags;
        this.archetypeTags = archetypeTags;
        this.notes = notes;
    }
}

class MultiFrameAnnotation {
    constructor(frameStart, frameEnd, pedTags, egoTags, sceneTags, archetypeTags, notes) {
        this.frameStart = frameStart;
        this.frameEnd = frameEnd;
        this.pedTags = pedTags;
        this.egoTags = egoTags;
        this.sceneTags = sceneTags;
        this.archetypeTags = archetypeTags;
        this.notes = notes;
    }
}

let allAnnotations = [];
firstTimeLoaded = true;
document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-all-annotations');
    if (saveButton) {
        saveButton.addEventListener('click', saveAllAnnotations);
    } else {
        console.error('Save button not found');
    }
    const downloadJsonBtn = document.getElementById('download-json-btn');
    downloadJsonBtn.addEventListener('click', exportAnnotationsAsJSON);

    //SET UP SEARCH FUNCTIONALITY
    // createTagCheckboxes();

    // createTagCheckboxes('pedestrian-tag-container', tagCategories.pedestrian);
    // setupSearchFunctionality('search-pedestrian-tag', 'pedestrian-tag-container', tagCategories.pedestrian);

    // createTagCheckboxes('vehicle-tag-container', tagCategories.vehicle);
    // setupSearchFunctionality('search-vehicle-tag', 'vehicle-tag-container', tagCategories.vehicle);

    // createTagCheckboxes('environment-tag-container', tagCategories.environment);
    // setupSearchFunctionality('search-environment-tag', 'environment-tag-container', tagCategories.environment);

    const loadVideoButton = document.getElementById('load-video');
    videoPlayer = document.getElementById('video-player');
    playPauseButton = document.getElementById('play-pause');
    previousFrameButton = document.getElementById('previous-frame');
    nextFrameButton = document.getElementById('next-frame');
    currentFrameSlider = document.getElementById('current-frame');
    frameCount = document.getElementById('frame_count');
    startFrame = document.getElementById("start-frame");
    endFrame = document.getElementById("end-frame");
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');

            const activeContent = document.getElementById(`${tabName}-content`);
            activeContent.classList.add('active');

            if (tabName === 'all') {
                document.getElementById('download-json-btn').disabled = false;
                // } else if (isVideoLoaded && firstTimeLoaded) {
                //     createTagCheckboxes(`${tabName}-tag-container`, tagCategories[tabName]);
                //     createTagCheckboxes();
                //     firstTimeLoaded = false;
                //     SET UP SEARCH FUNCTIONALITY
                //     setupSearchFunctionality(`search-${tabName}-tag`, `${tabName}-tag-container`, tagCategories[tabName]);
                // 
            }
        });
    });

    const selectAnnotationType = document.getElementById('annotation-options')
    selectAnnotationType.addEventListener('click', (event) => {
        console.log("selecting annotation type")
        endFrameLabel = document.getElementById("end-frame-label")
        startFrameLabel = document.getElementById("start-frame-label")
        if (event.target.value == 'single frame') {
            console.log("Single Frame")
            endFrame.style.display = 'none';
            endFrameLabel.style.display = 'none';
            startFrameLabel.innerText = 'Frame:';
        } else if (event.target.value == 'multi frame') {
            console.log("Multi Frame")
            endFrame.style.display = 'block';
            endFrameLabel.style.display = 'block';
            endFrameLabel.innerText = 'End Frame: ';
            startFrameLabel.innerText = 'Start Frame: ';
        }
    })

    loadVideoButton.addEventListener('click', () => {
        const videoUrl = document.getElementById('video-url').value;
        if (videoUrl) {
            const embedUrl = getYouTubeEmbedUrl(videoUrl);
            if (embedUrl) {
                videoPlayer.innerHTML = `<iframe id="youtube-player" width="100%" height="100%" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                player = new YT.Player('youtube-player', {
                    events: {
                        'onReady': onPlayerReady,
                        'onStateChange': onPlayerStateChange
                    },
                    playerVars: {
                        controls: 0,
                    },
                });
            } else {
                alert('Please enter a valid YouTube URL.');
            }
        } else {
            alert('Please enter a YouTube URL.');
        }
    });

    playPauseButton.addEventListener('click', function(event) {
        console.log("Play button clicked. Disabled state:", this.disabled);
        togglePlayPause();
        event.preventDefault();
    });

    currentFrameSlider.addEventListener('input', (event) => {
        if (player && player.seekTo) {
            const duration = player.getDuration();
            const time = duration * (event.target.value / 1000);
            player.seekTo(time);

        }
    });

    nextFrameButton.addEventListener('click', (event) => {
        if (player && player.seekTo) {
            const currentTime = player.getCurrentTime();
            const nextTime = currentTime + 1;
            player.seekTo(nextTime);
            updateCurrentFrame();
        }
    });

    previousFrameButton.addEventListener('click', (event) => {
        if (player && player.seekTo) {
            const currentTime = player.getCurrentTime();
            const nextTime = currentTime - 1;
            player.seekTo(nextTime);
            updateCurrentFrame();
        }
    });

    const frameJumpInput = document.getElementById('frame-jump-input');
    const frameJumpButton = document.getElementById('frame-jump-button');
    const frameJumpInputBackward = document.getElementById('frame-jump-input-backward');
    const frameJumpButtonBackward = document.getElementById('frame-jump-button-backward');

    frameJumpButton.addEventListener('click', () => {
        const framesToJump = parseInt(frameJumpInput.value);
        if (!isNaN(framesToJump) && player) {
            const currentTime = player.getCurrentTime();
            const frameRate = player.getVideoData().fps || 30;
            const newTime = currentTime + (framesToJump / frameRate);
            player.seekTo(newTime, true);
            setTimeout(updateCurrentFrame, 200)
        }
    });

    frameJumpButtonBackward.addEventListener('click', () => {
        const framesToJump = parseInt(frameJumpInputBackward.value);
        if (!isNaN(framesToJump) && player) {
            const currentTime = player.getCurrentTime();
            const frameRate = player.getVideoData().fps || 30;
            const newTime = currentTime - (framesToJump / frameRate);
            player.seekTo(newTime, true);
            setTimeout(updateCurrentFrame, 200)
        }
    });

    const lockVideoButton = document.getElementById('lock-video');
    lockVideoButton.addEventListener('click', lockVideo);

    const deleteButton = document.getElementById('delete-annotations-btn');
    deleteButton.addEventListener('click', deleteAnnotation);
});


// function getCheckedTags(containerId, useTagId = false) {
//     const container = document.getElementById(containerId);
//     let checkedTags = [];

//     for (let i = 0; i < container.childNodes.length; i++) {
//         const checkbox = container.childNodes[i].childNodes[0];
//         if (checkbox.checked) {
//             if (useTagId) {
//                 checkedTags.push(checkbox.id);
//             } else {
//                 checkedTags.push(checkbox.name.replace(/-/g, ' '));
//             }
//         }
//     }

//     return checkedTags;
// }

function getCheckedTags(containerId) {
    const container = document.getElementById(containerId);

    checkedTags = [];
    checkedTags.length = container.childNodes.length;
    for (let i = 0; i < container.childNodes.length; i++) {
        tag = [];
        tag[0] = container.childNodes[i].childNodes[0].id;
        tag[1] = container.childNodes[i].childNodes[0].name;

        checkedTags[i] = tag;
    }
    return checkedTags;
}

function updateAllAnnotationsDisplay() {
    const container = document.getElementById('all-annotations-container');
    if (!container) {
        console.error('Error: all-annotations-container not found');
        return;
    }

    container.innerHTML = '';

    allAnnotations.forEach((annotation, index) => {
        const annotationElement = document.createElement('div');
        annotationElement.classList.add('annotation-item');

        let frameInfo;
        if (annotation instanceof SingleFrameAnnotation) {
            frameInfo = `Frame: ${annotation.frame}`;
        } else if (annotation instanceof MultiFrameAnnotation) {
            frameInfo = `Frame: ${annotation.frameStart}-${annotation.frameEnd}`;
        } else {
            frameInfo = 'Frame: Unknown';
        }
        pedTags = [];
        for (let i = 0; i < annotation.pedTags.length; i++) {
            pedTags[i] = annotation.pedTags[i][1];
        }
        egoTags = [];
        for (let i = 0; i < annotation.egoTags.length; i++) {
            egoTags[i] = annotation.egoTags[i][1];
        }
        sceneTags = [];
        for (let i = 0; i < annotation.sceneTags.length; i++) {
            sceneTags[i] = annotation.sceneTags[i][1];
        }
        archetypeTags = [];
        for (let i = 0; i < annotation.archetypeTags.length; i++) {
            archetypeTags[i] = annotation.archetypeTags[i][1];
        }

        annotationElement.innerHTML = `
            <h4>Annotation ${index + 1}</h4>
            <p>${frameInfo}</p>
            <p>Pedestrian Tags: ${pedTags ? pedTags.join(', ') : 'None'}</p>
            <p>Vehicle Tags: ${egoTags ? egoTags.join(', ') : 'None'}</p>
            <p>Environment Tags: ${sceneTags ? sceneTags.join(', ') : 'None'}</p>
            <p>Archetype Tags: ${archetypeTags ? archetypeTags.join(', ') : 'None'}</p>
            <p>Additional Notes: ${annotation.notes || 'None'}</p>
            <button class="delete-annotation" data-index="${index}">Delete</button>
        `;

        container.appendChild(annotationElement);
    });

    const deleteButtons = container.querySelectorAll('.delete-annotation');
    deleteButtons.forEach(button => {
        button.addEventListener('click', deleteWholeAnnotation);
    });
}

function deleteWholeAnnotation(event) {
    const index = parseInt(event.target.getAttribute('data-index'));
    if (isNaN(index)) {
        console.error('Invalid annotation index');
        return;
    }

    allAnnotations.splice(index, 1);

    const projectName = getProjectNameFromURL();
    const projects = JSON.parse(localStorage.getItem('projects')) || [];
    const projectIndex = projects.findIndex(p => p.projectName === projectName);

    if (projectIndex !== -1) {
        projects[projectIndex].data = {
            fps: player.getVideoData().fps || 30,
            multiFrameAnnotations: allAnnotations.filter(a => a instanceof MultiFrameAnnotation),
            singleFrameAnnotations: allAnnotations.filter(a => a instanceof SingleFrameAnnotation)
        };
        localStorage.setItem('projects', JSON.stringify(projects));
    }

    updateAllAnnotationsDisplay();
}

function getPedTags() {
    return fetch("./ped_tags.json")
        .then((result) => {
            if (!result.ok) {
                throw new Error(`HTTP error! Status: ${result.status}`);
            }
            return result.json();
        })
        .catch((error) => {
            console.error("Unable to fetch data:", error);
            throw error;
        });
}

function getVehicleTags() {
    return fetch("./vehicle_tags.json")
        .then((result) => {
            if (!result.ok) {
                throw new Error(`HTTP error! Status: ${result.status}`);
            }
            return result.json();
        })
        .catch((error) => {
            console.error("Unable to fetch data:", error);
            throw error;
        });
}

function getEnvironmentTags() {
    return fetch("./environment_tags.json")
        .then((result) => {
            if (!result.ok) {
                throw new Error(`HTTP error! Status: ${result.status}`);
            }
            return result.json();
        })
        .catch((error) => {
            console.error("Unable to fetch data:", error);
            throw error;
        });
}

function setupSearchFunctionality(allTags, tagDiv, containerId, searchInputId) {
    const searchInput = document.getElementById(searchInputId);
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredTags = [];
        for (let category in allTags) {
            if (category.toLowerCase().includes(searchTerm)) {
                for (let tag in allTags[category]) {
                    filteredTags[filteredTags.length] = allTags[category][tag];
                }
            }
            else {
                allTags[category].forEach((tag) => {
                    for (let tagInfo in tag) {
                        if (tagInfo.toLowerCase() == "synonyms") {
                            tag[tagInfo].forEach((synonym) => {
                                if (synonym.includes(searchTerm) && !filteredTags.includes(tag)) {
                                    filteredTags[filteredTags.length] = tag;
                                }
                            })
                        }
                    }
                });
            }
        }

        const tagContainer = document.getElementById(containerId);
        tagContainer.innerHTML = '';
        
        console.log("filtered tags", filteredTags);
        filteredTags.forEach((tag) => {
            loadTagCheckboxes(tag, tagDiv, containerId);
        })
    });
}


function loadTagCheckboxes(tag, tagDivId, containerId) {
    const tagDiv = document.getElementById(tagDivId)
    const container = document.getElementById(containerId);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = !isVideoLoaded;
    checkbox.id = tag["tag-id"];
    checkbox.name = tag["display"];

    currAnnotationsContainer = document.getElementById('curr-annotations')

    checkbox.addEventListener('click', () => {
        if (checkbox.checked) {
            tagContainer = document.createElement('div');

            tagCheckbox = document.createElement('input');
            tagCheckbox.type = 'checkbox';
            tagCheckbox.name = tag["display"];
            tagCheckbox.id = tag["tag-id"];

            tagCheckbox.style.padding = '10px';

            tagText = document.createElement('label');
            tagText.innerText = tag["display"];

            tagContainer.appendChild(tagCheckbox);
            tagContainer.appendChild(tagText);

            tagExists = false;
            if (tagDiv.childNodes.length == 0) {
                tagExists = false;
            } else {
                tagDiv.childNodes.forEach(currContainer => {
                    if (currContainer.childNodes[0].name == tagCheckbox.name) {
                        tagExists = true;
                    }
                });
            }

            if (!tagExists) {
                tagDiv.appendChild(tagContainer);
            }
        }
    });

    const label = document.createElement('label');
    label.htmlFor = tag["tag-id"];
    label.name = tag["tag-id"];
    label.textContent = tag["display"];

    const div = document.createElement('div');
    div.classList.add('tag-item');
    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
}


let isVideoLoaded = false;
function createTagCheckboxes() {
    getPedTags()
        .then((data) => {
            console.log("Fetched data:", data);
            data.behavior.forEach(tag => {
                loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
            });
            data["instant-reaction"].forEach(tag => {
                loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
            });
            data.collision.forEach(tag => {
                loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
            });
            data["mental-state"].forEach(tag => {
                loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
            });
            data.intention.forEach(tag => {
                loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
            });
            setupSearchFunctionality(data, "ped-tag", 'pedestrian-tag-container', 'search-pedestrian-tag');
        })
        .catch((error) => {
            console.error("Error fetching data:", error);
        });

    getVehicleTags()
        .then((data) => {
            console.log("Fetched data:", data);
            data.behavior.forEach(tag => {
                loadTagCheckboxes(tag, "ego-tags", 'vehicle-tag-container');
            });
            data.collision.forEach(tag => {
                loadTagCheckboxes(tag, "ego-tags", 'vehicle-tag-container');
            });
            data.interaction.forEach(tag => {
                loadTagCheckboxes(tag, "ego-tags", 'vehicle-tag-container');
            });
            data.irregular.forEach(tag => {
                loadTagCheckboxes(tag, "ego-tags", 'vehicle-tag-container');
            });
            setupSearchFunctionality(data, "ego-tag", 'vehicle-tag-container', 'search-vehicle-tag');
        })
        .catch((error) => {
            console.error("Error fetching data:", error);
        });

    getEnvironmentTags()
        .then((data) => {
            console.log("Fetched data:", data);
            data["time-weather"].forEach(tag => {
                loadTagCheckboxes(tag, "env-tags", 'environment-tag-container');
            });
            data["traffic-lights"].forEach(tag => {
                loadTagCheckboxes(tag, "env-tags", 'environment-tag-container');
            });
            data["road-signs"].forEach(tag => {
                loadTagCheckboxes(tag, "env-tags", 'environment-tag-container');
            });
            data.locations.forEach(tag => {
                loadTagCheckboxes(tag, "env-tags", 'environment-tag-container');
            });
            data.traffic.forEach(tag => {
                loadTagCheckboxes(tag, "env-tags", 'environment-tag-container');
            });
            data.visibility.forEach(tag => {
                loadTagCheckboxes(tag, "env-tags", 'environment-tag-container');
            });
            setupSearchFunctionality(data, "env-tag", 'environment-tag-container', 'search-environment-tag');
        })
        .catch((error) => {
            console.error("Error fetching data:", error);
        });

    getArchetypesTags()
        .then((data) => {
            console.log("Fetched archetype data:", data);
            data.archetypes.forEach(tag => {
                loadTagCheckboxes(tag, "archetype-tags", 'archetypes-tag-container');
            });
            setupSearchFunctionality(data, "archetype-tags", 'archetypes-tag-container', 'search-archetypes-tag');
        })
        .catch((error) => {
            console.error("Error fetching archetype data:", error);
        });
}

function deleteAnnotation() {
    tagDiv = document.getElementById('ped-tags');
    for (let i = 0; i < tagDiv.childNodes.length; i++) {
        if (tagDiv.childNodes[i].childNodes[0].checked) {
            console.log(tagDiv.childNodes[i].childNodes[1].innerText)
            tagDiv.childNodes[i].remove();
            i--;
        }
    }

    tagDiv = document.getElementById('ego-tags');
    for (let i = 0; i < tagDiv.childNodes.length; i++) {
        if (tagDiv.childNodes[i].childNodes[0].checked) {
            console.log(tagDiv.childNodes[i].childNodes[1].innerText)
            tagDiv.childNodes[i].remove();
            i--;
        }
    }

    tagDiv = document.getElementById('env-tags');
    for (let i = 0; i < tagDiv.childNodes.length; i++) {
        if (tagDiv.childNodes[i].childNodes[0].checked) {
            console.log(tagDiv.childNodes[i].childNodes[1].innerText)
            tagDiv.childNodes[i].remove();
            i--;
        }
    }

    tagDiv = document.getElementById('archetype-tags');
    for (let i = 0; i < tagDiv.childNodes.length; i++) {
        if (tagDiv.childNodes[i].childNodes[0].checked) {
            console.log(tagDiv.childNodes[i].childNodes[1].innerText)
            tagDiv.childNodes[i].remove();
            i--;
        }
    }
}

let lockInterval;
let lockedStartFrame = null;
let lockedEndFrame = null;

function lockVideo() {
    const startFrameInput = document.getElementById('start-frame');
    const endFrameInput = document.getElementById('end-frame');
    const lockVideoButton = document.getElementById('lock-video');
    const playPauseButton = document.getElementById('play-pause');
    const annotationType = document.querySelector('input[name="select_annotations"]:checked').value;

    if (!isVideoLocked) {
        const startFrameValue = parseInt(startFrameInput.value);
        const endFrameValue = parseInt(endFrameInput.value);
        const fps = player.getVideoData().fps || 30;

        if (annotationType === 'single frame') {
            if (!isNaN(startFrameValue)) {
                isVideoLocked = true;
                const targetTime = startFrameValue / fps;
                lockedStartFrame = startFrameValue;
                lockedEndFrame = startFrameValue;

                startFrameInput.disabled = true;
                lockVideoButton.textContent = 'Unlock Video';

                playPauseButton.disabled = true;
                console.log("Video locked for single frame. isVideoLocked:", isVideoLocked);

                player.seekTo(targetTime, true);
                player.pauseVideo();

                updateUIForFrame(startFrameValue);

                if (lockInterval) clearInterval(lockInterval);

                lockInterval = setInterval(() => {
                    if (player.getPlayerState() !== YT.PlayerState.PAUSED) {
                        player.pauseVideo();
                    }
                }, 100);
            } else {
                alert('Please enter a valid frame number.');
                return;
            }
        } else if (annotationType === 'multi frame') {
            if (!isNaN(startFrameValue) && !isNaN(endFrameValue) && startFrameValue < endFrameValue) {
                isVideoLocked = true;
                lockedStartFrame = startFrameValue;
                lockedEndFrame = endFrameValue;
                const startTime = startFrameValue / fps;
                const endTime = endFrameValue / fps;

                startFrameInput.disabled = true;
                endFrameInput.disabled = true;
                lockVideoButton.textContent = 'Unlock Video';

                playPauseButton.disabled = false;
                console.log("Video locked for multi frame. isVideoLocked:", isVideoLocked);

                player.seekTo(startTime, true);

                updateUIForFrame(startFrameValue);

                if (lockInterval) clearInterval(lockInterval);

                lockInterval = setInterval(() => {
                    const currentTime = player.getCurrentTime();
                    if (currentTime < startTime || currentTime >= endTime) {
                        player.seekTo(startTime, true);
                    }
                    const currentFrame = Math.round(currentTime * fps);
                    updateUIForFrame(currentFrame);
                }, 100);
            } else {
                alert('Please enter valid start and end frames.');
                return;
            }
        }
    } else {
        isVideoLocked = false;
        console.log("Video unlocked. isVideoLocked:", isVideoLocked);
        startFrameInput.disabled = false;
        endFrameInput.disabled = false;
        lockVideoButton.textContent = 'Lock Video';
        playPauseButton.disabled = false;
        playPauseButton.textContent = 'Play';
        isPlaying = false;
        lockedStartFrame = null;
        lockedEndFrame = null;

        if (lockInterval) {
            clearInterval(lockInterval);
            lockInterval = null;
        }
    }
}

function updateUIForFrame(frame) {
    const fps = player.getVideoData().fps || 30;
    const duration = player.getDuration();
    const currentTime = frame / fps;

    // Update frame count display
    document.getElementById('frame-count').textContent = `Frame: ${frame}`;

    // Update slider position
    const sliderValue = (currentTime / duration) * 1000;
    document.getElementById('current-frame').value = sliderValue;
}

function checkVideoBounds(startTime, endTime) {
    const currentTime = player.getCurrentTime();

    if (currentTime < startTime || currentTime > endTime) {
        player.seekTo(startTime, true);
        player.pauseVideo();
    }
}

function clearCurrentAnnotations() {
    document.getElementById('ped-tags').innerHTML = '';
    document.getElementById('ego-tags').innerHTML = '';
    document.getElementById('env-tags').innerHTML = '';
    document.getElementById('archetype-tags').innerHTML = '';

    document.getElementById('additional-annotations').value = '';

    uncheckAllCheckboxes('pedestrian-tag-container');
    uncheckAllCheckboxes('vehicle-tag-container');
    uncheckAllCheckboxes('environment-tag-container');
    uncheckAllCheckboxes('archetypes-tag-container');
}

function saveAnnotationsToLocalStorage() {
    const projectName = getProjectNameFromURL();
    const videoUrl = document.getElementById('video-url').value;
    const annotationData = {
        fps: player.getVideoData().fps || 30,
        multiFrameAnnotations: allAnnotations.filter(a => a instanceof MultiFrameAnnotation),
        singleFrameAnnotations: allAnnotations.filter(a => a instanceof SingleFrameAnnotation)
    };

    const projects = JSON.parse(localStorage.getItem('projects')) || [];

    const projectIndex = projects.findIndex(p => p.projectName === projectName);
    if (projectIndex !== -1) {
        projects[projectIndex].data = annotationData;
    } else {
        projects.push({
            projectName: projectName,
            videoLink: videoUrl,
            data: annotationData
        });
    }

    localStorage.setItem('projects', JSON.stringify(projects));
}

function loadAnnotationsFromLocalStorage() {
    const projectName = getProjectNameFromURL();
    const projects = JSON.parse(localStorage.getItem('projects')) || [];
    const project = projects.find(p => p.projectName === projectName);

    if (project && project.data) {
        allAnnotations = [
            ...project.data.multiFrameAnnotations.map(a => new MultiFrameAnnotation(
                a.frameStart, a.frameEnd, a.pedTags, a.egoTags, a.sceneTags, a.archetypeTags, a.notes
            )),
            ...project.data.singleFrameAnnotations.map(a => new SingleFrameAnnotation(
                a.frame, a.pedTags, a.egoTags, a.sceneTags, a.archetypeTags, a.notes
            ))
        ];
        updateAllAnnotationsDisplay();
    }
}


function saveAllAnnotations() {
    if (!isVideoLocked) {
        alert('Please lock the video before saving annotations.');
        return;
    }

    const annotationType = document.querySelector('input[name="select_annotations"]:checked').value;

    const pedestrianTags = getCheckedTags('ped-tags');
    const vehicleTags = getCheckedTags('ego-tags');
    const environmentTags = getCheckedTags('env-tags');
    const archetypeTags = getCheckedTags('archetype-tags');
    const additionalNotes = document.getElementById('additional-annotations').value;

    if (pedestrianTags.length === 0 && vehicleTags.length === 0 && environmentTags.length === 0 && archetypeTags.length === 0) {
        alert('No tags selected. Please select at least one tag to save an annotation.');
        return;
    }

    let annotation;
    if (annotationType === 'single frame') {
        annotation = new SingleFrameAnnotation(
            lockedStartFrame,
            pedestrianTags,
            vehicleTags,
            environmentTags,
            archetypeTags,
            additionalNotes
        );
    } else {
        annotation = new MultiFrameAnnotation(
            lockedStartFrame,
            lockedEndFrame,
            pedestrianTags,
            vehicleTags,
            environmentTags,
            archetypeTags,
            additionalNotes
        );
    }

    allAnnotations.push(annotation);

    try {
        updateAllAnnotationsDisplay();
        saveAnnotationsToLocalStorage();

        clearCurrentAnnotations();

        alert('Annotations saved successfully!');
    } catch (error) {
        console.error('Error updating annotations display:', error);
        alert('Annotation saved, but there was an error updating the display. Please check the console for details.');
    }
}

function uncheckAllCheckboxes(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
}

function exportAnnotationsAsJSON() {
    const videoUrl = document.getElementById('video-url').value;
    const fps = player.getVideoData().fps || 30;
    const projectName = getProjectNameFromURL();

    const annotationsData = {
        name: projectName,
        fps: fps,
        video_path: videoUrl,
        multiFrameAnnotations: allAnnotations.filter(a => a instanceof MultiFrameAnnotation).map(a => ({
            frameStart: a.frameStart,
            frameEnd: a.frameEnd,
            pedTags: a.pedTags.map(tagArray => tagArray[0]),
            egoTags: a.egoTags.map(tagArray => tagArray[0]),
            sceneTags: a.sceneTags.map(tagArray => tagArray[0]),
            archetypeTags: a.archetypeTags.map(tagArray => tagArray[0]),
            additionalNotes: a.notes
        })),
        singleFrameAnnotations: allAnnotations.filter(a => a instanceof SingleFrameAnnotation).map(a => ({
            frame: a.frame,
            pedTags: a.pedTags.map(tagArray => tagArray[0]),
            egoTags: a.egoTags.map(tagArray => tagArray[0]),
            sceneTags: a.sceneTags.map(tagArray => tagArray[0]),
            archetypeTags: a.archetypeTags.map(tagArray => tagArray[0]),
            additionalNotes: a.notes
        }))
    };

    const jsonString = JSON.stringify(annotationsData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_annotations.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function updateCurrentFrame() {
    textContainer = document.getElementById('frame-count');
    const currentTime = player.getCurrentTime();
    const fps = player.getVideoData().fps || 30; // Default to 30 if fps is not available
    const currentFrame = Math.round(currentTime * fps);
    // console.log('Current Frame:', currentFrame);
    textContainer.textContent = "Frame: " + currentFrame;
}

function togglePlayPause() {
    console.log("togglePlayPause called. isVideoLocked:", isVideoLocked);
    const annotationType = document.querySelector('input[name="select_annotations"]:checked').value;

    if (player && player.getPlayerState) {
        if (annotationType === 'single frame' && isVideoLocked) {
            console.log("Can't toggle play/pause for locked single frame");
            return;
        }

        if (isPlaying) {
            player.pauseVideo();
            playPauseButton.textContent = 'Play';
            isPlaying = false;
            clearInterval(intervalId);
        } else {
            player.playVideo();
            playPauseButton.textContent = 'Pause';
            isPlaying = true;
            intervalId = setInterval(updateSlider, 1000 / 30);
        }
    }
}

function updateSlider() {
    if (player && player.getCurrentTime && player.getDuration) {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        const value = (currentTime / duration) * 1000;
        currentFrameSlider.value = value;
        updateCurrentFrame();
    }
}

function getYouTubeEmbedUrl(url) {
    const videoId = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return videoId ? `https://www.youtube.com/embed/${videoId[1]}?enablejsapi=1` : null;
}

function onPlayerReady(event) {
    console.log("YouTube player ready");
    player = event.target;
    event.target.playVideo();

    isVideoLoaded = true;
    enableAllElements();
    loadAnnotationsFromLocalStorage(); // Add this line
}

function getArchetypesTags() {
    return fetch("./archetypes.json")
        .then((result) => {
            if (!result.ok) {
                throw new Error(`HTTP error! Status: ${result.status}`);
            }
            return result.json();
        })
        .catch((error) => {
            console.error("Unable to fetch data:", error);
            throw error;
        });
}

function enableAllElements() {
    document.querySelectorAll('button').forEach(button => button.disabled = false);

    document.querySelectorAll('input').forEach(input => input.disabled = false);

    document.getElementById('current-frame').disabled = false;

    document.querySelectorAll('input[type="radio"]').forEach(radio => radio.disabled = false);

    document.getElementById('download-json-btn').disabled = false;

    ['pedestrian', 'vehicle', 'environment'].forEach(tabName => {
        const container = document.getElementById(`${tabName}-tag-container`);
        if (container) {
            container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => checkbox.disabled = false);
        }
    });

    createTagCheckboxes();

    // getPedTags()
    // .then((data) => {
    //     console.log("Fetched data:", data);
    //     data.behavior.forEach(tag => {
    //         loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
    //     });
    //     data["instant-reaction"].forEach(tag => {
    //         loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
    //     });
    //     data.collision.forEach(tag => {
    //         loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
    //     });
    //     data["mental-state"].forEach(tag => {
    //         loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
    //     });
    //     data.intention.forEach(tag => {
    //         loadTagCheckboxes(tag, "ped-tags", 'pedestrian-tag-container');
    //     });
    // })
    // .catch((error) => {
    //     console.error("Error fetching data:", error);
    // });

    // setupSearchFunctionality(, "ped-tag", 'pedestrian-tag-container', 'search-pedestrian-tag');

    // setupSearchFunctionality(, "ego-tag", 'vehicle-tag-container', 'search-vehicle-tag');

    // setupSearchFunctionality(, "env-tag", 'environment-tag-container', 'search-environment-tag');

}

let isPlaying = false;

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING && !isPlaying) {
        playPauseButton.textContent = 'Pause';
        isPlaying = true;
        intervalId = setInterval(updateSlider, 1000 / 30);
    } else if (event.data === YT.PlayerState.PAUSED && isPlaying) {
        playPauseButton.textContent = 'Play';
        isPlaying = false;
        clearInterval(intervalId);
    }

    if (isVideoLocked && event.data === YT.PlayerState.ENDED) {
        const startFrameValue = parseInt(document.getElementById('start-frame').value);
        const fps = player.getVideoData().fps || 30;
        const startTime = startFrameValue / fps;
        player.seekTo(startTime, true);
        player.playVideo();
    }
}

function createAnnotation(frameStart, frameEnd, pedTags, egoTags, sceneTags) {
    if (frameStart === frameEnd) {
        return new SingleFrameAnnotation(frameStart, pedTags, egoTags, sceneTags);
    } else {
        return new MultiFrameAnnotation(frameStart, frameEnd, pedTags, egoTags, sceneTags);
    }
}

function getProjectNameFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectName = urlParams.get('projectName');
    return projectName || 'Unnamed Project';
}

document.getElementById('home-button').addEventListener('click', function() {
    window.location.href = 'index.html';
});