let audioContext;
let audioBuffer;

const createFilter = (context, type, frequency, q, gain) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    if (gain !== undefined) {
        filter.gain.value = gain;
    }
    return filter;
}

const applyFiltersAndDownload = async () => {
    if (!audioBuffer) {
        alert("Per favore seleziona prima un file audio!");
        return;
    }

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );
    const offlineSource = offlineContext.createBufferSource();
    offlineSource.buffer = audioBuffer;

    // Creare i filtri nell'OfflineAudioContext
    const highPassFilter = createFilter(offlineContext, 'highpass', 120, 1.7);
    const peakFilter1 = createFilter(offlineContext, 'peaking', 550, 1.5, -3);
    const peakFilter2 = createFilter(offlineContext, 'peaking', 10000, 2.5, -5);
    const highShelfFilter = createFilter(offlineContext, 'highshelf', 12000, 1, 6);

    // Collegare i filtri in serie
    offlineSource.connect(highPassFilter);
    highPassFilter.connect(peakFilter1);
    peakFilter1.connect(peakFilter2);
    peakFilter2.connect(highShelfFilter);
    highShelfFilter.connect(offlineContext.destination);

    offlineSource.start(0);
    const renderedBuffer = await offlineContext.startRendering();

    const wavBlob = bufferToWaveBlob(renderedBuffer);
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(wavBlob);
    downloadLink.download = 'filtered_audio.wav';
    downloadLink.click();
}

const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const arrayBuffer = e.target.result;
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.decodeAudioData(arrayBuffer, function (buffer) {
                audioBuffer = buffer;
            });
        };
        reader.readAsArrayBuffer(file);
        const btn = document.getElementById('applyFiltersButton')
        btn.classList.remove('disabled');
    }
}

const bufferToWaveBlob = (buffer) => {
    const numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferArray = new ArrayBuffer(length),
        view = new DataView(bufferArray),
        channels = [],
        sampleRate = buffer.sampleRate,
        bitDepth = 16;

    let offset = 0;

    const setUint16 = (data) => {
        view.setUint16(offset, data, true);
        offset += 2;
    }

    const setUint32 = (data) => {
        view.setUint32(offset, data, true);
        offset += 4;
    }

    // RIFF identifier
    setUint32(0x46464952);
    // file length minus RIFF identifier length and file description length
    setUint32(length - 8);
    // RIFF type
    setUint32(0x45564157);
    // format chunk identifier
    setUint32(0x20746d66);
    // format chunk length
    setUint32(16);
    // sample format (raw)
    setUint16(1);
    // channel count
    setUint16(numOfChan);
    // sample rate
    setUint32(sampleRate);
    // byte rate (sample rate * block align)
    setUint32(sampleRate * numOfChan * bitDepth / 8);
    // block align (channel count * bytes per sample)
    setUint16(numOfChan * bitDepth / 8);
    // bits per sample
    setUint16(bitDepth);
    // data chunk identifier
    setUint32(0x61746164);
    // data chunk length
    setUint32(length - offset - 4);

    // write the PCM samples
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
            channels[channel] = buffer.getChannelData(channel);
            const sample = Math.max(-1, Math.min(1, channels[channel][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
}

window.onload = () => {
    document.getElementById('audioFile').addEventListener('change', handleFileSelect);
    document.getElementById('applyFiltersButton').addEventListener('click', applyFiltersAndDownload);
}
