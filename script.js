let player;
let videoPlayer;
let playPauseButton;
let currentFrameSlider;
let intervalId;
let isVideoLocked = false;

// Class definitions based on the data model
class Recording {
    constructor(videoPath, fps) {
        this.videoPath = videoPath;
        this.fps = fps;
        this.annotations = [];
    }
}

class SingleFrameAnnotation {
    constructor(frame, pedTags, egoTags, sceneTags, notes) {
        this.frame = frame;
        this.pedTags = pedTags;
        this.egoTags = egoTags;
        this.sceneTags = sceneTags;
        this.notes = notes;
    }
}

class MultiFrameAnnotation {
    constructor(frameStart, frameEnd, pedTags, egoTags, sceneTags, notes) {
        this.frameStart = frameStart;
        this.frameEnd = frameEnd;
        this.pedTags = pedTags;
        this.egoTags = egoTags;
        this.sceneTags = sceneTags;
        this.notes = notes;
    }
}
// Tag definitions
const tagCategories = {
    pedestrian: [
        'Trip', 'Along lane', 'Brisk-walk', 'Group-walk', 'Group-disperse', 'Dog-walk', 'Retreat', 'Speed-up', 'Slow-down', 'Wander', 'Pause-start', 'Pause-start', 'Jaywalking', 'Cross-on-red', 'Swerve', 'Break', 'Hesitation', 'Phone-Usage', 'Conversation',
    ],
    vehicle: [
        'Car', 'Truck', 'Bus', 'Motorcycle', 'Bicycle',
        'Emergency vehicle', 'Taxi', 'Van', 'SUV', 'Speeding',
        'Parking', 'U-turn', 'Lane change', 'Braking', 'Acceleration', 'Full-Stop', 'Stop-and-go', 'Vehicle-on-vehicle-collision', 'Vehicle-on-pedestrian-collision',
    ],
    environment: [
        'Crosswalk', 'Traffic light', 'Stop sign', 'Intersection', 'Sidewalk',
        'Bike lane', 'Construction', 'Weather: Sunny', 'Weather: Rainy', 'Weather: Snowy',
        'Day', 'Night', 'Rush hour', 'Residential area', 'Commercial area'
    ]
};

let allAnnotations = [];

document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for save all annotations button
    const saveButton = document.getElementById('save-all-annotations');
    if (saveButton) {
        saveButton.addEventListener('click', saveAllAnnotations);
    } else {
        console.error('Save button not found');
    }
    // Initialize the first tab (Pedestrian)
    createTagCheckboxes('pedestrian-tag-container', tagCategories.pedestrian);
    setupSearchFunctionality('search-pedestrian-tag', 'pedestrian-tag-container', tagCategories.pedestrian);

    // Initialize other tabs
    createTagCheckboxes('vehicle-tag-container', tagCategories.vehicle);
    setupSearchFunctionality('search-vehicle-tag', 'vehicle-tag-container', tagCategories.vehicle);

    createTagCheckboxes('environment-tag-container', tagCategories.environment);
    setupSearchFunctionality('search-environment-tag', 'environment-tag-container', tagCategories.environment);

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

            if (tabName !== 'all' && isVideoLoaded) {
                createTagCheckboxes(`${tabName}-tag-container`, tagCategories[tabName]);
                setupSearchFunctionality(`search-${tabName}-tag`, `${tabName}-tag-container`, tagCategories[tabName]);
            }
        });
    });

    selectAnnotationType = document.getElementById('annotation-options')
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
                    }
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
        event.preventDefault(); // Prevent any default button behavior
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

    // Pedestrian tag creation
    const pedestrianTags = [
        'Trip', 'Alone lane', 'Brisk-walk', 'Group-walk', 'Group-disperse',
        'Dog-walk', 'Retreat', 'Speed-up', 'Slow-down', 'Wander',
        'Pause-start', 'Jaywalking', 'Cross-on-red', 'Swerve', 'Break'
    ];

    const searchPedestrianTag = document.getElementById('search-pedestrian-tag');

    searchPedestrianTag.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredTags = pedestrianTags.filter(tag =>
            tag.toLowerCase().includes(searchTerm)
        );
        createPedestrianTags(filteredTags);
    });
});

function getCheckedTags(containerId) {
    const container = document.getElementById(containerId);

    checkedTags = [];
    checkedTags.length = container.childNodes.length;
    for (let i = 0; i < container.childNodes.length; i++) {
        checkedTags[i] = container.childNodes[i].childNodes[1].innerText.replace(/-/g, ' ');
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

        annotationElement.innerHTML = `
            <h4>Annotation ${index + 1}</h4>
            <p>${frameInfo}</p>
            <p>Pedestrian Tags: ${annotation.pedTags ? annotation.pedTags.join(', ') : 'None'}</p>
            <p>Vehicle Tags: ${annotation.egoTags ? annotation.egoTags.join(', ') : 'None'}</p>
            <p>Environment Tags: ${annotation.sceneTags ? annotation.sceneTags.join(', ') : 'None'}</p>
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

    updateAllAnnotationsDisplay();
}

let isVideoLoaded = false;
function createTagCheckboxes(containerId, tags) {
    const container = document.getElementById(containerId);

    container.innerHTML = '';
    tags.forEach(tag => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = !isVideoLoaded;
        checkbox.id = `${containerId}-${tag.toLowerCase().replace(/\s+/g, '-')}`;
        checkbox.name = tag.toLowerCase().replace(/\s+/g, '-');
        checkbox.value = tag;

        currAnnotationsContainer = document.getElementById('curr-annotations')

        checkbox.addEventListener('click', () => {

            if (checkbox.checked) {
                if (tagCategories.pedestrian.includes(tag)) {
                    tagDiv = document.getElementById('ped-tags');
                } else if (tagCategories.vehicle.includes(tag)) {
                    tagDiv = document.getElementById('ego-tags');
                } else {
                    tagDiv = document.getElementById('env-tags');
                }

                tagContainer = document.createElement('div');

                tagCheckbox = document.createElement('input');
                tagCheckbox.type = 'checkbox';
                tagCheckbox.value = checkbox.name;
                tagCheckbox.style.padding = '10px';

                tagText = document.createElement('label');
                tagText.innerText = checkbox.name;

                tagContainer.appendChild(tagCheckbox);
                tagContainer.appendChild(tagText);

                tagExists = false;
                if (tagDiv.childNodes.length == 0) {
                    tagExists = false;
                } else {
                    tagDiv.childNodes.forEach(currContainer => {
                        if (currContainer.childNodes[0].value == tagCheckbox.value) {
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
        label.htmlFor = checkbox.id;
        label.textContent = tag;

        const div = document.createElement('div');
        div.classList.add('tag-item');
        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
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

function saveAllAnnotations() {
    if (!isVideoLocked) {
        alert('Please lock the video before saving annotations.');
        return;
    }

    const annotationType = document.querySelector('input[name="select_annotations"]:checked').value;

    const pedestrianTags = getCheckedTags('ped-tags');
    console.log("got pedestrian tags")
    const vehicleTags = getCheckedTags('ego-tags');
    const environmentTags = getCheckedTags('env-tags');
    const additionalNotes = document.getElementById('additional-annotations').value;

    if (pedestrianTags.length === 0 && vehicleTags.length === 0 && environmentTags.length === 0) {
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
            additionalNotes
        );
    } else {
        annotation = new MultiFrameAnnotation(
            lockedStartFrame,
            lockedEndFrame,
            pedestrianTags,
            vehicleTags,
            environmentTags,
            additionalNotes
        );
    }

    allAnnotations.push(annotation);

    try {
        updateAllAnnotationsDisplay();
    } catch (error) {
        console.error('Error updating annotations display:', error);
        alert('Annotation saved, but there was an error updating the display. Please check the console for details.');
    }

    // Clear selected tags
    tagDiv = document.getElementById('ped-tags');
    if (tagDiv) {
        tagDiv.innerHTML = '';
    }

    tagDiv = document.getElementById('ego-tags');
    if (tagDiv) {
        tagDiv.innerHTML = '';
    }

    tagDiv = document.getElementById('env-tags');
    if (tagDiv) {
        tagDiv.innerHTML = '';
    }

    // Clear additional notes
    const additionalAnnotationsInput = document.getElementById('additional-annotations');
    if (additionalAnnotationsInput) {
        additionalAnnotationsInput.value = '';
    }

    alert('Annotations saved successfully!');
}

function setupSearchFunctionality(searchInputId, tagContainerId, allTags) {
    const searchInput = document.getElementById(searchInputId);
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(searchTerm));
        createTagCheckboxes(tagContainerId, filteredTags);
    });
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
}


function enableAllElements() {
    document.querySelectorAll('button').forEach(button => button.disabled = false);

    document.querySelectorAll('input').forEach(input => input.disabled = false);

    document.getElementById('current-frame').disabled = false;

    document.querySelectorAll('input[type="radio"]').forEach(radio => radio.disabled = false);

    ['pedestrian', 'vehicle', 'environment'].forEach(tabName => {
        const container = document.getElementById(`${tabName}-tag-container`);
        if (container) {
            container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => checkbox.disabled = false);
        }
    });

    createTagCheckboxes('pedestrian-tag-container', tagCategories.pedestrian);
    createTagCheckboxes('vehicle-tag-container', tagCategories.vehicle);
    createTagCheckboxes('environment-tag-container', tagCategories.environment);

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
