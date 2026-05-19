console.log('initializing soundcloud-rpc');

setInterval(() => {
    const player = document.querySelector('.playbackSoundBadge__titleLink');
    const author = document.querySelector('.playbackSoundBadge__lightLink');
    const positionElem = document.querySelector('#app > div.playControls.g-z-index-control-bar.m-visible > section > div > div.playControls__elements > div.playControls__timeline.sc-ml-3x > div > div.playbackTimeline__timePassed.sc-text-primary.sc-text-h5 > span:nth-child(2)');
    const lengthElem = document.querySelector('#app > div.playControls.g-z-index-control-bar.m-visible > section > div > div.playControls__elements > div.playControls__timeline.sc-ml-3x > div > div.playbackTimeline__duration.sc-text-primary.sc-text-h5 > span:nth-child(2)');
    const coverElem = document.querySelector('#app > div.playControls.g-z-index-control-bar.m-visible > section > div > div.playControls__elements > div.playControls__soundBadge.sc-ml-3x > div > a > div > span');

    if (player && author && positionElem && lengthElem && coverElem) {
        const coverStyle = window.getComputedStyle(coverElem);
        let coverImageUrl = coverStyle.backgroundImage.slice(5, -2);

        // upgrade to high-res: replace any size suffix with t500x500
        coverImageUrl = coverImageUrl
            .replace(/-mini\./, '-t500x500.')
            .replace(/-small\./, '-t500x500.')
            .replace(/-badge\./, '-t500x500.')
            .replace(/-large\./, '-t500x500.')
            .replace(/-t67x67\./, '-t500x500.')
            .replace(/-t300x300\./, '-t500x500.')
            .replace(/\/artworks-[^/]+-[^/]+-\w+\./, (match) =>
                match.replace(/-\w+\.$/, '-t500x500.')
            );

        const track = {
            title: player.title,
            author: author.textContent.trim(),
            position: positionElem.textContent.trim(),
            length: lengthElem.textContent.trim(),
            coverImageUrl,
        };

        window.api.send('plugin:to-backend', { type: 'update-track', track });
    }
}, 1000);