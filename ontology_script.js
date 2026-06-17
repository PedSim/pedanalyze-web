let player;
let videoPlayer;
let playPauseButton;
let currentFrameSlider;
let useStartBtn;
let useEndBtn;
let frameCount;
let intervalId;
let isVideoLocked = false;
const DEFAULT_FPS = 30;
const PLAYER_STATES = {
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2
};
const UPLOAD_DB_NAME = 'PedAnalyzeUploads';
const UPLOAD_STORE_NAME = 'videos';
let currentVideoType = 'youtube';
let currentVideoFps = DEFAULT_FPS;
let hasInitializedVideoFromQuery = false;
let pendingYouTubeVideoUrl = null;
let isYouTubeApiReady = false;

// Archetype suggestion system
let rawTagsData = null;
let suggestedArchetypes = [];
let rawTagsDataPromise = null;

// Confirm-before-save modal state
let confirmSaveModalInitialized = false;

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

async function getUploadedVideoRecord(id) {
    if (!id) {
        return null;
    }

    const db = await openUploadDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(UPLOAD_STORE_NAME, 'readonly');
        const store = transaction.objectStore(UPLOAD_STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function getProjectNameFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectName = urlParams.get('projectName');
    return projectName || 'Unnamed Project';
}

function updateAnnotationTitle() {
    const titleElement = document.getElementById('annotation-title');
    if (titleElement) {
        titleElement.textContent = getProjectNameFromURL();
    }
}

function getProjectsFromStorage() {
    return JSON.parse(localStorage.getItem('projects')) || [];
}

function getCurrentProjectRecord() {
    const projectName = getProjectNameFromURL();
    const projects = getProjectsFromStorage();
    return projects.find(p => p.projectName === projectName) || null;
}

function getStoredProjectFps() {
    const project = getCurrentProjectRecord();
    return project && project.data && project.data.fps ? project.data.fps : DEFAULT_FPS;
}

function getPlayerFps() {
    if (!player || !player.getVideoData) {
        return currentVideoFps;
    }

    const videoData = player.getVideoData() || {};
    return videoData.fps || currentVideoFps || DEFAULT_FPS;
}

function clearVideoUpdateInterval() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

function onVideoReady(autoplay = true) {
    isVideoLoaded = true;
    enableAllElements();
    loadAnnotationsFromLocalStorage();
    setAnnotationControlsEnabled(false);

    if (autoplay && player && player.playVideo) {
        const playResult = player.playVideo();
        if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(() => {
                playPauseButton.textContent = 'Play';
            });
        }
    }
}

function setAnnotationControlsEnabled(enabled) {
    const hint = document.getElementById('lock-hint');
    if (hint) {
        hint.style.display = enabled ? 'none' : 'block';
    }

    const idsToDisable = [
        'search-pedestrian-tag',
        'search-vehicle-tag',
        'search-environment-tag',
        'search-archetypes-tag',
        'additional-annotations',
        'save-all-annotations'
    ];

    idsToDisable.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
    });

    // Tag checkboxes themselves
    ['pedestrian-tag-container', 'vehicle-tag-container', 'environment-tag-container', 'archetypes-tag-container'].forEach(
        (containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.disabled = !enabled;
            });
        }
    );
}

function createLocalVideoPlayerAdapter(videoElement) {
    const adapter = {
        element: videoElement,
        getCurrentTime: () => videoElement.currentTime || 0,
        getDuration: () => videoElement.duration || 0,
        seekTo: (time) => {
            const safeTime = Math.max(0, Math.min(time, videoElement.duration || time));
            videoElement.currentTime = safeTime;
        },
        playVideo: () => videoElement.play(),
        pauseVideo: () => videoElement.pause(),
        getPlayerState: () => {
            if (videoElement.ended) {
                return PLAYER_STATES.ENDED;
            }

            return videoElement.paused ? PLAYER_STATES.PAUSED : PLAYER_STATES.PLAYING;
        },
        getVideoData: () => ({ fps: currentVideoFps })
    };

    videoElement.addEventListener('play', () => onPlayerStateChange({ data: PLAYER_STATES.PLAYING }));
    videoElement.addEventListener('pause', () => onPlayerStateChange({ data: PLAYER_STATES.PAUSED }));
    videoElement.addEventListener('ended', () => onPlayerStateChange({ data: PLAYER_STATES.ENDED }));

    return adapter;
}

function loadYouTubeVideo(videoUrl) {
    const embedUrl = getYouTubeEmbedUrl(videoUrl);

    if (!embedUrl) {
        alert('Please enter a valid YouTube URL.');
        return;
    }

    if (!isYouTubeApiReady || !window.YT || !window.YT.Player) {
        pendingYouTubeVideoUrl = videoUrl;
        videoPlayer.innerHTML = '<div style="color: white; display: flex; align-items: center; justify-content: center; height: 100%;">Loading YouTube video...</div>';
        return;
    }

    currentVideoType = 'youtube';
    currentVideoFps = getStoredProjectFps();
    pendingYouTubeVideoUrl = null;
    videoPlayer.innerHTML = `<iframe id="youtube-player" width="100%" height="100%" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    player = new YT.Player('youtube-player', {
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        },
        playerVars: {
            controls: 0,
            origin: window.location.origin,
        },
    });
}

async function loadUploadedVideoFromProject() {
    const urlParams = new URLSearchParams(window.location.search);
    const uploadedVideoId = urlParams.get('uploadedVideoId') || (getCurrentProjectRecord() || {}).uploadedVideoId;
    const project = getCurrentProjectRecord();
    const uploadedVideoRecord = await getUploadedVideoRecord(uploadedVideoId);

    if (!uploadedVideoRecord || !uploadedVideoRecord.file) {
        alert('The uploaded video file for this project could not be found.');
        return;
    }

    currentVideoType = 'upload';
    currentVideoFps = getStoredProjectFps();

    const uploadedVideoUrl = URL.createObjectURL(uploadedVideoRecord.file);
    const localVideoLabel = uploadedVideoRecord.name || (project && project.videoTitle) || 'Uploaded video';

    videoPlayer.innerHTML = `<video id="local-video-player" width="100%" height="100%" preload="metadata" playsinline></video>`;

    const localVideoElement = document.getElementById('local-video-player');
    const handleLocalVideoReady = () => {
        onVideoReady(true);
        updateCurrentFrame();
    };

    localVideoElement.addEventListener('loadedmetadata', handleLocalVideoReady, { once: true });
    localVideoElement.addEventListener('canplay', handleLocalVideoReady, { once: true });
    localVideoElement.addEventListener('error', () => {
        console.error('Failed to load uploaded video file.');
        alert('The uploaded video could not be loaded.');
    }, { once: true });

    localVideoElement.setAttribute('aria-label', localVideoLabel);
    localVideoElement.style.width = '100%';
    localVideoElement.style.height = '100%';
    localVideoElement.style.display = 'block';
    localVideoElement.src = uploadedVideoUrl;
    localVideoElement.load();
    player = createLocalVideoPlayerAdapter(localVideoElement);

    if (localVideoElement.readyState >= 1) {
        handleLocalVideoReady();
    }

    document.getElementById('video-url').value = localVideoLabel;
}

async function initializeVideoFromQuery() {
    if (hasInitializedVideoFromQuery) {
        return;
    }

    hasInitializedVideoFromQuery = true;
    const urlParams = new URLSearchParams(window.location.search);
    const videoType = urlParams.get('videoType');
    const videoUrl = urlParams.get('video');

    if (videoType === 'upload') {
        await loadUploadedVideoFromProject();
        return;
    }

    if (videoUrl) {
        document.getElementById('video-url').value = videoUrl;
        loadYouTubeVideo(videoUrl);
    }
}

window.onYouTubeIframeAPIReady = function() {
    isYouTubeApiReady = true;

    if (pendingYouTubeVideoUrl) {
        loadYouTubeVideo(pendingYouTubeVideoUrl);
    }
};

if (window.YT && window.YT.Player) {
    isYouTubeApiReady = true;
}
document.addEventListener('DOMContentLoaded', () => {
    updateAnnotationTitle();

    const saveButton = document.getElementById('save-all-annotations');
    if (saveButton) {
        saveButton.addEventListener('click', openConfirmSaveModal);
    } else {
        console.error('Save button not found');
    }
    const downloadJsonBtn = document.getElementById('download-json-btn');
    downloadJsonBtn.addEventListener('click', exportAnnotationsAsJSON);

    const annotationTagSearch = document.getElementById('search-annotation-tag');
    if (annotationTagSearch) {
        annotationTagSearch.addEventListener('input', updateAllAnnotationsDisplay);
    }
    
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
    frameCount = document.getElementById('frame-count');
    startFrame = document.getElementById("start-frame");
    endFrame = document.getElementById("end-frame");
    useStartBtn = document.getElementById("use-start-frame");
    useEndBtn = document.getElementById("use-end-frame");
    const startInput = document.getElementById("start-frame");
    const endInput = document.getElementById("end-frame");

    function getCurrentFrame() {
      const text = frameCount.textContent;
      return parseInt(text.replace("Frame:", "").trim(), 10) || 0;
    }

    if (useStartBtn) {
      useStartBtn.addEventListener("click", () => {
        const frame = getCurrentFrame();
        startInput.value = frame;
      });
    }

    if (useEndBtn) {
      useEndBtn.addEventListener("click", () => {
        const frame = getCurrentFrame();
        endInput.value = frame;
      });
    }

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
    
        endFrameLabel = document.getElementById("end-frame-label")
        startFrameLabel = document.getElementById("start-frame-label")
        if (event.target.value == 'single frame') {
    
            endFrame.style.display = 'none';
            endFrameLabel.style.display = 'none';
            startFrameLabel.innerText = 'Frame:';
        } else if (event.target.value == 'multi frame') {
    
            endFrame.style.display = 'block';
            endFrameLabel.style.display = 'block';
            endFrameLabel.innerText = 'End Frame: ';
            startFrameLabel.innerText = 'Start Frame: ';
        }
    })

    loadVideoButton.addEventListener('click', async () => {
        const videoUrl = document.getElementById('video-url').value;
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('videoType') === 'upload') {
            await loadUploadedVideoFromProject();
        } else if (videoUrl) {
            loadYouTubeVideo(videoUrl);
        } else {
            alert('Please enter a YouTube URL.');
        }
    });

    playPauseButton.addEventListener('click', function(event) {
    
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
            const frameRate = getPlayerFps();
            const newTime = currentTime + (framesToJump / frameRate);
            player.seekTo(newTime, true);
            setTimeout(updateCurrentFrame, 200)
        }
    });

    frameJumpButtonBackward.addEventListener('click', () => {
        const framesToJump = parseInt(frameJumpInputBackward.value);
        if (!isNaN(framesToJump) && player) {
            const currentTime = player.getCurrentTime();
            const frameRate = getPlayerFps();
            const newTime = currentTime - (framesToJump / frameRate);
            player.seekTo(newTime, true);
            setTimeout(updateCurrentFrame, 200)
        }
    });

    const lockVideoButton = document.getElementById('lock-video');
    lockVideoButton.addEventListener('click', lockVideo);

    window.initializeVideoFromQuery = initializeVideoFromQuery;
    initializeVideoFromQuery();
});

function initConfirmSaveModalIfNeeded() {
    if (confirmSaveModalInitialized) return;
    confirmSaveModalInitialized = true;

    const overlay = document.getElementById('confirm-save-modal');
    const backBtn = document.getElementById('confirm-save-back');
    const confirmBtn = document.getElementById('confirm-save-confirm');

    if (!overlay || !backBtn || !confirmBtn) {
        console.error('Confirm-save modal elements not found');
        return;
    }

    backBtn.addEventListener('click', closeConfirmSaveModal);

    // Click outside panel to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeConfirmSaveModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const isOpen = overlay.classList.contains('open');
            if (isOpen) closeConfirmSaveModal();
        }
    });

    confirmBtn.addEventListener('click', () => {
        // Apply modal notes back to the real notes input
        const modalNotes = document.getElementById('confirm-save-notes');
        const notesInput = document.getElementById('additional-annotations');
        if (modalNotes && notesInput) {
            notesInput.value = modalNotes.value;
        }

        closeConfirmSaveModal();
        saveAllAnnotations();
    });
}

function openConfirmSaveModal() {
    initConfirmSaveModalIfNeeded();

    if (!isVideoLocked) {
        alert('Please lock the video before saving annotations.');
        return;
    }

    const pedestrianTags = getCheckedTags('pedestrian-tag-container');
    const vehicleTags = getCheckedTags('vehicle-tag-container');
    const environmentTags = getCheckedTags('environment-tag-container');
    const archetypeTags = getCheckedTags('archetypes-tag-container');

    if (
        pedestrianTags.length === 0 &&
        vehicleTags.length === 0 &&
        environmentTags.length === 0 &&
        archetypeTags.length === 0
    ) {
        alert('No tags selected. Please select at least one tag to save an annotation.');
        return;
    }

    const overlay = document.getElementById('confirm-save-modal');
    if (!overlay) return;

    renderConfirmSaveModal({
        annotationType: document.querySelector('input[name="select_annotations"]:checked')?.value || 'multi frame',
        frameStart: lockedStartFrame,
        frameEnd: lockedEndFrame,
        tags: {
            ped: pedestrianTags,
            ego: vehicleTags,
            env: environmentTags,
            arch: archetypeTags
        },
        notes: document.getElementById('additional-annotations')?.value || ''
    });

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeConfirmSaveModal() {
    const overlay = document.getElementById('confirm-save-modal');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
}

function renderConfirmSaveModal(draft) {
    const meta = document.getElementById('confirm-save-meta');
    const modalNotes = document.getElementById('confirm-save-notes');

    if (meta) {
        const typeLabel = draft.annotationType === 'single frame' ? 'Single frame' : 'Multi frame';
        const rangeLabel =
            draft.annotationType === 'single frame'
                ? `Frame: ${draft.frameStart ?? ''}`
                : `Frames: ${draft.frameStart ?? ''}–${draft.frameEnd ?? ''}`;
        meta.textContent = `${typeLabel} • ${rangeLabel}`;
    }

    if (modalNotes) {
        modalNotes.value = draft.notes || '';
    }

    const mapping = [
        { listId: 'confirm-tags-ped', sourceContainerId: 'pedestrian-tag-container', tags: draft.tags.ped },
        { listId: 'confirm-tags-ego', sourceContainerId: 'vehicle-tag-container', tags: draft.tags.ego },
        { listId: 'confirm-tags-env', sourceContainerId: 'environment-tag-container', tags: draft.tags.env },
        { listId: 'confirm-tags-arch', sourceContainerId: 'archetypes-tag-container', tags: draft.tags.arch }
    ];

    mapping.forEach(({ listId, sourceContainerId, tags }) => {
        const list = document.getElementById(listId);
        if (!list) return;
        list.innerHTML = '';

        (tags || []).forEach(([tagId, tagName]) => {
            const row = document.createElement('div');
            row.className = 'modal-tag-item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.id = `${listId}-${tagId}`;
            cb.dataset.sourceContainerId = sourceContainerId;
            cb.dataset.sourceTagId = tagId;

            const label = document.createElement('label');
            label.htmlFor = cb.id;
            label.textContent = tagName;

            const syncToSource = () => {
                const source = document.querySelector(
                    `#${sourceContainerId} input[type="checkbox"]#${CSS.escape(tagId)}`
                );
                if (source) {
                    source.checked = cb.checked;
                    source.dispatchEvent(new Event('change', { bubbles: true }));
                }
            };

            cb.addEventListener('change', syncToSource);

            // Make the whole row clickable (easier than hitting the small checkbox).
            row.addEventListener('click', (event) => {
                if (event.target === cb) return;
                cb.checked = !cb.checked;
                syncToSource();
            });

            row.appendChild(cb);
            row.appendChild(label);
            list.appendChild(row);
        });
    });
}


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

let editingAnnotationIndex = null;

function getCheckedTags(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const checkedTags = [];
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    
    checkboxes.forEach(checkbox => {
        checkedTags.push([checkbox.id, checkbox.name]);
    });
    
    return checkedTags;
}

function updateCurrentAnnotationsFromCheckboxes() {
    // Kept for backward compatibility with edit flow; selection source of truth is tab checkboxes.
    onTagSelectionChanged();
}

function parseAnnotationFrameRange(annotation) {
    if (annotation instanceof SingleFrameAnnotation) {
        return { type: 'single', start: annotation.frame, end: annotation.frame };
    } else if (annotation instanceof MultiFrameAnnotation) {
        return { type: 'multi', start: annotation.frameStart, end: annotation.frameEnd };
    }
    return { type: 'single', start: 0, end: 0 };
}

function setAnnotationTypeControls(type) {
    const singleRadio = document.querySelector('input[value="single frame"]');
    const multiRadio = document.querySelector('input[value="multi frame"]');
    const endFrameLabel = document.getElementById('end-frame-label');
    const startFrameLabel = document.getElementById('start-frame-label');
    const endFrameInput = document.getElementById('end-frame');

    if (type === 'single') {
        if (singleRadio) singleRadio.checked = true;
        if (multiRadio) multiRadio.checked = false;
        if (endFrameLabel) endFrameLabel.style.display = 'none';
        if (endFrameInput) endFrameInput.style.display = 'none';
        if (startFrameLabel) startFrameLabel.innerText = 'Frame:';
    } else {
        if (singleRadio) singleRadio.checked = false;
        if (multiRadio) multiRadio.checked = true;
        if (endFrameLabel) endFrameLabel.style.display = 'block';
        if (endFrameInput) endFrameInput.style.display = 'block';
        if (startFrameLabel) startFrameLabel.innerText = 'Start Frame:';
    }
}

function onSavedAnnotationFrameClick(annotation) {
    if (isVideoLocked) {
        alert('Please unlock the current locked annotation frame before selecting a saved frame.');
        return;
    }

    const frameRange = parseAnnotationFrameRange(annotation);
    setAnnotationTypeControls(frameRange.type);

    const startFrameInput = document.getElementById('start-frame');
    const endFrameInput = document.getElementById('end-frame');
    if (startFrameInput) startFrameInput.value = frameRange.start;
    if (endFrameInput) endFrameInput.value = frameRange.type === 'single' ? frameRange.start : frameRange.end;

    lockVideo();
}

function hasCurrentSelectedTags() {
    const tagContainers = ['pedestrian-tag-container', 'vehicle-tag-container', 'environment-tag-container', 'archetypes-tag-container'];
    return tagContainers.some(containerId => {
        const container = document.getElementById(containerId);
        return container && container.querySelectorAll('input[type="checkbox"]:checked').length > 0;
    });
}

function onUnlockAndEditClick(annotation, index) {
    const hasTags = hasCurrentSelectedTags();
    if (hasTags) {
        const proceed = confirm('There are currently selected annotation tags. Your selected tags will be erased. Do you want to continue?');
        if (!proceed) {
            return;
        }
    }

    // Unlock if locked
    if (isVideoLocked) {
        lockVideo(); // unlock
    }

    clearCurrentAnnotations();

    // Set editing mode
    editingAnnotationIndex = index;

    // Set frames and lock
    const frameRange = parseAnnotationFrameRange(annotation);
    setAnnotationTypeControls(frameRange.type);

    const startFrameInput = document.getElementById('start-frame');
    const endFrameInput = document.getElementById('end-frame');
    if (startFrameInput) startFrameInput.value = frameRange.start;
    if (endFrameInput) endFrameInput.value = frameRange.type === 'single' ? frameRange.start : frameRange.end;

    lockVideo();

    // Populate tags
    annotation.pedTags.forEach(tag => {
        const checkbox = document.querySelector(`#pedestrian-tag-container input[id="${tag[0]}"]`);
        if (checkbox) checkbox.checked = true;
    });
    annotation.egoTags.forEach(tag => {
        const checkbox = document.querySelector(`#vehicle-tag-container input[id="${tag[0]}"]`);
        if (checkbox) checkbox.checked = true;
    });
    annotation.sceneTags.forEach(tag => {
        const checkbox = document.querySelector(`#environment-tag-container input[id="${tag[0]}"]`);
        if (checkbox) checkbox.checked = true;
    });
    annotation.archetypeTags.forEach(tag => {
        const checkbox = document.querySelector(`#archetypes-tag-container input[id="${tag[0]}"]`);
        if (checkbox) checkbox.checked = true;
    });

    // Set notes
    const notesInput = document.getElementById('additional-annotations');
    if (notesInput) notesInput.value = annotation.notes || '';

    updateCurrentAnnotationsFromCheckboxes();
}

function updateAllAnnotationsDisplay() {
    const container = document.getElementById('all-annotations-container');
    if (!container) {
        console.error('Error: all-annotations-container not found');
        return;
    }

    container.innerHTML = '';

    const searchInput = document.getElementById('search-annotation-tag');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const indexed = allAnnotations.map((a, i) => ({ annotation: a, originalIndex: i }));

    indexed.sort((a, b) => {
        const aFrame = a.annotation instanceof MultiFrameAnnotation ? a.annotation.frameStart : a.annotation.frame;
        const bFrame = b.annotation instanceof MultiFrameAnnotation ? b.annotation.frameStart : b.annotation.frame;
        return aFrame - bFrame;
    });

    const filtered = searchTerm
        ? indexed.filter(({ annotation }) => {
            const allTags = [
                ...annotation.pedTags,
                ...annotation.egoTags,
                ...annotation.sceneTags,
                ...annotation.archetypeTags
            ];
            return allTags.some(tag => tag[1].toLowerCase().includes(searchTerm));
        })
        : indexed;

    filtered.forEach(({ annotation, originalIndex }, displayIndex) => {
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

        const pedTags = annotation.pedTags.map(t => t[1]);
        const egoTags = annotation.egoTags.map(t => t[1]);
        const sceneTags = annotation.sceneTags.map(t => t[1]);
        const archetypeTags = annotation.archetypeTags.map(t => t[1]);

        annotationElement.innerHTML = `
            <h4>Annotation ${displayIndex + 1}</h4>
            <div class="annotation-frame-container">
                <p class="annotation-frame-line"></p>
                <button class="unlock-edit-btn" data-index="${originalIndex}">Unlock and edit</button>
            </div>
            <p>Pedestrian Tags: ${pedTags.length ? pedTags.join(', ') : 'None'}</p>
            <p>Vehicle Tags: ${egoTags.length ? egoTags.join(', ') : 'None'}</p>
            <p>Environment Tags: ${sceneTags.length ? sceneTags.join(', ') : 'None'}</p>
            <p>Archetype Tags: ${archetypeTags.length ? archetypeTags.join(', ') : 'None'}</p>
            <p>Additional Notes: ${annotation.notes || 'None'}</p>
            <button class="delete-annotation" data-index="${originalIndex}">Delete</button>
        `;

        const frameLine = annotationElement.querySelector('.annotation-frame-line');
        if (frameLine) {
            const frameButton = document.createElement('button');
            frameButton.type = 'button';
            frameButton.className = 'annotation-frame-link';
            frameButton.textContent = frameInfo;
            frameButton.addEventListener('click', () => onSavedAnnotationFrameClick(annotation));
            frameLine.appendChild(frameButton);
        }

        container.appendChild(annotationElement);
    });

    const deleteButtons = container.querySelectorAll('.delete-annotation');
    deleteButtons.forEach(button => {
        button.addEventListener('click', deleteWholeAnnotation);
    });

    const unlockEditButtons = container.querySelectorAll('.unlock-edit-btn');
    unlockEditButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const index = parseInt(event.target.getAttribute('data-index'));
            const annotation = allAnnotations[index];
            onUnlockAndEditClick(annotation, index);
        });
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
            fps: getPlayerFps(),
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
        let filteredTags = [];
        
        function collectTags(obj) {
            for (let key in obj) {
                if (Array.isArray(obj[key])) {
                    obj[key].forEach((tag) => {
                        if (tag.display && tag.display.toLowerCase().includes(searchTerm)) {
                            filteredTags.push(tag);
                        } else if (tag.synonyms && tag.synonyms.some(syn => syn.toLowerCase().includes(searchTerm))) {
                            filteredTags.push(tag);
                        }
                    });
                } else if (typeof obj[key] === 'object') {
                    collectTags(obj[key]);
                }
            }
        }
        
        collectTags(allTags);

        const tagContainer = document.getElementById(containerId);
        tagContainer.innerHTML = '';
        
        // Rebuild the structure with headings when categories exist
        const buildSection = (title, tags) => {
            const section = document.createElement('div');
            section.className = 'tag-category-section';

            const heading = document.createElement('h4');
            heading.className = 'category-heading';
            heading.textContent = title.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            section.appendChild(heading);

            const row = document.createElement('div');
            row.className = 'category-tags-row';
            section.appendChild(row);
            tagContainer.appendChild(section);

            tags.forEach(tag => loadTagCheckboxes(tag, tagDiv, row));
        };

        let sectionBuilt = false;
        for (const category in allTags) {
            if (Array.isArray(allTags[category])) {
                const visibleTags = allTags[category].filter(tag => filteredTags.includes(tag));
                if (!visibleTags.length) continue;
                buildSection(category, visibleTags);
                sectionBuilt = true;
            } else if (typeof allTags[category] === 'object') {
                for (const subCategory in allTags[category]) {
                    const visibleTags = allTags[category][subCategory].filter(tag => filteredTags.includes(tag));
                    if (!visibleTags.length) continue;
                    buildSection(subCategory, visibleTags);
                    sectionBuilt = true;
                }
            }
        }

        if (!sectionBuilt) {
            filteredTags.forEach((tag) => {
                loadTagCheckboxes(tag, tagDiv, containerId);
            });
        }
    });
}


function loadTagCheckboxes(tag, tagDivId, containerId) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = !isVideoLoaded;
    checkbox.id = tag["tag-id"];
    checkbox.name = tag["display"];

    checkbox.addEventListener('change', () => {
        onTagSelectionChanged();
    });

    const label = document.createElement('label');
    label.htmlFor = tag["tag-id"];
    label.name = tag["tag-id"];
    label.textContent = tag["display"];

    const div = document.createElement('div');
    div.classList.add('tag-item');
    div.appendChild(checkbox);
    div.appendChild(label);

    // Stop propagation so label/checkbox clicks don't also trigger the row toggle.
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    label.addEventListener('click', (e) => e.stopPropagation());

    // Make the whole row clickable (background click), without fighting native label behavior.
    div.addEventListener('click', (event) => {
        const target = event.target;
        if (target === checkbox || target === label) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    container.appendChild(div);
}

function onTagSelectionChanged() {
    // Centralized hook for any tag checkbox toggle.
    // (Suggested archetypes and confirm-save modal will also depend on this.)
    if (typeof renderSuggestedArchetypesFromSource === 'function') {
        renderSuggestedArchetypesFromSource();
    }
}

function renderTagSections(data, containerId, tagDivId) {
    const container = document.getElementById(containerId);
    for (const category in data) {
        if (Array.isArray(data[category])) {
            const section = document.createElement('div');
            section.className = 'tag-category-section';

            const heading = document.createElement('h4');
            heading.className = 'category-heading';
            heading.textContent = category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            const row = document.createElement('div');
            row.className = 'category-tags-row';
            row.id = `${containerId}-${category.replace(/[^a-z0-9]+/gi, '-')}`;

            section.appendChild(heading);
            section.appendChild(row);
            container.appendChild(section);

            data[category].forEach(tag => {
                loadTagCheckboxes(tag, tagDivId, row);
            });
        } else if (typeof data[category] === 'object') {
            for (const subCategory in data[category]) {
                const section = document.createElement('div');
                section.className = 'tag-category-section';

                const heading = document.createElement('h4');
                heading.className = 'category-heading';
                heading.textContent = subCategory.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                const row = document.createElement('div');
                row.className = 'category-tags-row';
                row.id = `${containerId}-${subCategory.replace(/[^a-z0-9]+/gi, '-')}`;

                section.appendChild(heading);
                section.appendChild(row);
                container.appendChild(section);

                data[category][subCategory].forEach(tag => {
                    loadTagCheckboxes(tag, tagDivId, row);
                });
            }
        }
    }
}

let isVideoLoaded = false;
function createTagCheckboxes() {
    // Load raw tags data for archetype suggestions
    rawTagsDataPromise = loadRawTagsData();

    getPedTags()
        .then((data) => {
            console.log("Fetched pedestrian tag data:", data);
            renderTagSections(data, 'pedestrian-tag-container', 'ped-tags');
            setupSearchFunctionality(data, "ped-tags", 'pedestrian-tag-container', 'search-pedestrian-tag');
        })
        .catch((error) => {
            console.error("Error fetching Pedestrian data:", error);
        });

    getVehicleTags()
        .then((data) => {
            console.log("Fetched vehicle tag data:", data);
            const vehicleContainer = document.getElementById('vehicle-tag-container');
            for (const category in data) {
                if (Array.isArray(data[category])) {
                    const section = document.createElement('div');
                    section.className = 'tag-category-section';

                    const heading = document.createElement('h4');
                    heading.className = 'category-heading';
                    heading.textContent = category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                    const row = document.createElement('div');
                    row.className = 'category-tags-row';
                    row.id = `vehicle-${category.replace(/[^a-z0-9]+/gi, '-')}`;

                    section.appendChild(heading);
                    section.appendChild(row);
                    vehicleContainer.appendChild(section);

                    data[category].forEach(tag => {
                        loadTagCheckboxes(tag, "ego-tags", row);
                    });
                } else if (typeof data[category] === 'object') {
                    for (const subCategory in data[category]) {
                        const section = document.createElement('div');
                        section.className = 'tag-category-section';

                        const heading = document.createElement('h4');
                        heading.className = 'category-heading';
                        heading.textContent = subCategory.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                        const row = document.createElement('div');
                        row.className = 'category-tags-row';
                        row.id = `vehicle-${subCategory.replace(/[^a-z0-9]+/gi, '-')}`;

                        section.appendChild(heading);
                        section.appendChild(row);
                        vehicleContainer.appendChild(section);

                        data[category][subCategory].forEach(tag => {
                            loadTagCheckboxes(tag, "ego-tags", row);
                        });
                    }
                }
            }
            setupSearchFunctionality(data, "ego-tags", 'vehicle-tag-container', 'search-vehicle-tag');
        })
        .catch((error) => {
            console.error("Error fetching Vehicle data:", error);
        });

    getEnvironmentTags()
        .then((data) => {
            console.log("Fetched environment tag data:", data);
            renderTagSections(data, 'environment-tag-container', 'env-tags');
            setupSearchFunctionality(data, "env-tags", 'environment-tag-container', 'search-environment-tag');
        })
        .catch((error) => {
            console.error("Error fetching Environment data:", error);
        });

    getArchetypesTags()
        .then((data) => {
            console.log("Fetched archetype data:", data);
            renderTagSections(data, 'archetypes-tag-container', 'archetype-tags');
            setupSearchFunctionality(data, "archetype-tags", 'archetypes-tag-container', 'search-archetypes-tag');
            renderSuggestedArchetypesFromSource();
        })
        .catch((error) => {
            console.error("Error fetching Archetype data:", error);
        });
}


// Tag removal is done by unchecking the tag itself (uncheck = delete).

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
        const fps = getPlayerFps();

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
                setAnnotationControlsEnabled(true);

                player.seekTo(targetTime, true);
                player.pauseVideo();

                updateUIForFrame(startFrameValue);

                if (lockInterval) clearInterval(lockInterval);

                lockInterval = setInterval(() => {
                    if (player.getPlayerState() !== PLAYER_STATES.PAUSED) {
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
                setAnnotationControlsEnabled(true);

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
        setAnnotationControlsEnabled(false);

        if (lockInterval) {
            clearInterval(lockInterval);
            lockInterval = null;
        }
    }
}

function updateUIForFrame(frame) {
    const fps = getPlayerFps();
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
    const notes = document.getElementById('additional-annotations');
    if (notes) notes.value = '';

    uncheckAllCheckboxes('pedestrian-tag-container');
    uncheckAllCheckboxes('vehicle-tag-container');
    uncheckAllCheckboxes('environment-tag-container');
    uncheckAllCheckboxes('archetypes-tag-container');

    onTagSelectionChanged();
}

function saveAnnotationsToLocalStorage() {
    const projectName = getProjectNameFromURL();
    const videoUrl = document.getElementById('video-url').value;
    const annotationData = {
        fps: getPlayerFps(),
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
        currentVideoFps = project.data.fps || currentVideoFps;
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

    const pedestrianTags = getCheckedTags('pedestrian-tag-container');
    const vehicleTags = getCheckedTags('vehicle-tag-container');
    const environmentTags = getCheckedTags('environment-tag-container');
    const archetypeTags = getCheckedTags('archetypes-tag-container');
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

    if (editingAnnotationIndex !== null) {
        // Update existing annotation
        allAnnotations[editingAnnotationIndex] = annotation;
        editingAnnotationIndex = null;
    } else {
        // Add new annotation
        allAnnotations.push(annotation);
    }

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
    const fps = getPlayerFps();
    const projectName = getProjectNameFromURL();

    const multiFrameAnnotations = allAnnotations.filter(a => a instanceof MultiFrameAnnotation);
    const singleFrameAnnotations = allAnnotations.filter(a => a instanceof SingleFrameAnnotation);

    const annotationsData = {
        name: projectName,
        fps: fps,
        video_path: videoUrl,
        numberOfSingleFrameAnnotations: singleFrameAnnotations.length,
        numberOfMultiFrameAnnotations: multiFrameAnnotations.length,
        multiFrameAnnotations: multiFrameAnnotations.map(a => ({
            frameStart: a.frameStart,
            frameEnd: a.frameEnd,
            pedTags: a.pedTags.map(tagArray => tagArray[0]),
            egoTags: a.egoTags.map(tagArray => tagArray[0]),
            sceneTags: a.sceneTags.map(tagArray => tagArray[0]),
            archetypeTags: a.archetypeTags.map(tagArray => tagArray[0]),
            additionalNotes: a.notes
        })),
        singleFrameAnnotations: singleFrameAnnotations.map(a => ({
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
    const fps = getPlayerFps();
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
            clearVideoUpdateInterval();
        } else {
            const playResult = player.playVideo();
            playPauseButton.textContent = 'Pause';
            isPlaying = true;
            intervalId = setInterval(updateSlider, 1000 / DEFAULT_FPS);

            if (playResult && typeof playResult.catch === 'function') {
                playResult.catch(() => {
                    playPauseButton.textContent = 'Play';
                    isPlaying = false;
                    clearVideoUpdateInterval();
                });
            }
        }
    }
}

function updateSlider() {
    if (player && player.getCurrentTime && player.getDuration) {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        if (!duration) {
            return;
        }
        const value = (currentTime / duration) * 1000;
        currentFrameSlider.value = value;
        updateCurrentFrame();
    }
}

function getYouTubeEmbedUrl(url) {
    const videoId = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!videoId) return null;
    const origin = encodeURIComponent(window.location.origin);
    return `https://www.youtube.com/embed/${videoId[1]}?enablejsapi=1&origin=${origin}&playsinline=1`;
}

function onPlayerReady(event) {
    console.log("YouTube player ready");
    player = event.target;
    currentVideoType = 'youtube';
    currentVideoFps = getStoredProjectFps();
    onVideoReady(true);
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

// Load raw_tags.json for archetype probability data
function loadRawTagsData() {
    return fetch("./raw_tags.json")
        .then((result) => {
            if (!result.ok) {
                throw new Error(`HTTP error! Status: ${result.status}`);
            }
            return result.json();
        })
        .then((data) => {
            rawTagsData = data;
            console.log("Raw tags data loaded successfully");
            return data;
        })
        .catch((error) => {
            console.error("Unable to fetch raw_tags.json:", error);
        });
}

// Calculate suggested archetypes based on selected pedestrian tags using log-sum for numerical stability
function calculateSuggestedArchetypes(selectedPedTags) {
    if (!rawTagsData || !rawTagsData.tag_to_archetype_probabilities) {
        console.warn("Raw tags data not loaded");
        return [];
    }

    if (selectedPedTags.length === 0) {
        suggestedArchetypes = [];
        return [];
    }

    // Get list of all archetypes from metadata
    const allArchetypes = rawTagsData._meta.archetypes;
    const tagProbs = rawTagsData.tag_to_archetype_probabilities;

    // Initialize scores object for log-sum approach
    const scores = {};
    allArchetypes.forEach(arch => {
        scores[arch] = 0;
    });

    // For each selected tag, add log probabilities (equivalent to multiplying probabilities)
    let validTagsCount = 0;
    selectedPedTags.forEach(tagArray => {
        const tagKey = tagArray[1]; // The display name is at index 1
        
        // Normalize tag key: replace spaces with hyphens for lookup
        const normalizedTagKey = tagKey.toLowerCase().replace(/\s+/g, '-');
        
        // Try exact match first, then normalized match
        const probs = tagProbs[tagKey] || tagProbs[normalizedTagKey];
        
        if (probs && typeof probs === 'object') {
            validTagsCount++;
            allArchetypes.forEach(archetype => {
                const prob = probs[archetype];
                if (prob && prob > 0) {
                    // Use log-sum for numerical stability when multiplying many probabilities
                    scores[archetype] += Math.log(prob);
                }
            });
        } else {
            console.warn(`Tag "${tagKey}" not found in probability data`);
        }
    });

    // If no valid tags were found, return empty suggestions
    if (validTagsCount === 0) {
        suggestedArchetypes = [];
        return [];
    }

    // Convert log scores back to probabilities and sort
    const normalizedScores = allArchetypes
        .map(archetype => ({
            name: archetype,
            logScore: scores[archetype],
            score: Math.exp(scores[archetype] / validTagsCount) // Normalize by number of tags
        }))
        .filter(item => item.logScore > -Infinity) // Only include archetypes with at least one tag match
        .sort((a, b) => b.logScore - a.logScore); // Sort by log score (higher is better)

    // Take top 5 archetypes
    suggestedArchetypes = normalizedScores
        .slice(0, 5)
        .map(item => item.name);

    // Debug logging
    console.log(`Suggested archetypes for tags [${selectedPedTags.map(t => t[1]).join(', ')}]:`, suggestedArchetypes);

    return suggestedArchetypes;
}

async function renderSuggestedArchetypesFromSource() {
    const suggestedArchetypesDiv = document.getElementById('suggested-archetypes');
    if (!suggestedArchetypesDiv) return;

    if (rawTagsDataPromise) {
        try {
            await rawTagsDataPromise;
        } catch (_) {
            // Ignore; calculateSuggestedArchetypes will handle missing data.
        }
    }

    // Source of truth: currently checked pedestrian tags in the Pedestrian tab
    const pedChecked = getCheckedTags('pedestrian-tag-container');
    calculateSuggestedArchetypes(pedChecked);

    suggestedArchetypesDiv.innerHTML = '';

    if (!suggestedArchetypes || suggestedArchetypes.length === 0) {
        return;
    }

    suggestedArchetypes.forEach(archetypeName => {
        const tagContainer = document.createElement('div');
        tagContainer.className = 'suggested-archetype-item';
        tagContainer.style.cursor = 'pointer';

        const suggestion = document.createElement('span');
        suggestion.className = 'suggested-badge';
        suggestion.innerText = 'Suggested';

        const tagText = document.createElement('label');
        tagText.innerText = archetypeName;
        tagText.style.cursor = 'pointer';

        tagContainer.appendChild(suggestion);
        tagContainer.appendChild(tagText);

        // Click to add/select in the archetype checkbox list
        tagContainer.addEventListener('click', () => {
            const archeContainer = document.getElementById('archetypes-tag-container');
            if (!archeContainer) return;

            const checkboxes = archeContainer.querySelectorAll('input[type="checkbox"]');
            const normalize = (s) => String(s || '')
                .toLowerCase()
                .trim()
                .replace(/[_\\s]+/g, '-')
                .replace(/-+/g, '-');

            const target = normalize(archetypeName);
            let match = null;

            for (const checkbox of checkboxes) {
                if (normalize(checkbox.name) === target) {
                    match = checkbox;
                    break;
                }
            }

            // Extra fallback: some displays may use spaces vs hyphens inconsistently
            if (!match) {
                for (const checkbox of checkboxes) {
                    const n = normalize(checkbox.name).replace(/-/g, '');
                    if (n === target.replace(/-/g, '')) {
                        match = checkbox;
                        break;
                    }
                }
            }

            if (match) {
                match.checked = true;
                match.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        suggestedArchetypesDiv.appendChild(tagContainer);
    });
}

function enableAllElements() {
    document.querySelectorAll('button').forEach(button => button.disabled = false);

    document.querySelectorAll('input').forEach(input => input.disabled = false);

    document.querySelectorAll('textarea').forEach(textarea => textarea.disabled = false);

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

    if (useStartBtn) useStartBtn.disabled = false;
    if (useEndBtn) useEndBtn.disabled = false;
}

let isPlaying = false;

function onPlayerStateChange(event) {
    if (event.data === PLAYER_STATES.PLAYING && !isPlaying) {
        playPauseButton.textContent = 'Pause';
        isPlaying = true;
        clearVideoUpdateInterval();
        intervalId = setInterval(updateSlider, 1000 / DEFAULT_FPS);
    } else if (event.data === PLAYER_STATES.PAUSED && isPlaying) {
        playPauseButton.textContent = 'Play';
        isPlaying = false;
        clearVideoUpdateInterval();
    }

    if (isVideoLocked && event.data === PLAYER_STATES.ENDED) {
        const startFrameValue = parseInt(document.getElementById('start-frame').value);
        const fps = getPlayerFps();
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

document.getElementById('home-button').addEventListener('click', function() {
    window.location.href = 'index.html';
});
