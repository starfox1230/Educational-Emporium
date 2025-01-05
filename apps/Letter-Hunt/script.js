document.addEventListener('DOMContentLoaded', (event) => {
    let currentLetter = '';
    let lastAttemptCorrect = false;
    let acceptInput = true;
    const letterDisplay = document.getElementById('letter-display');
    const faceDisplay = document.getElementById('face-display');
    const mainDisplay = document.querySelector('main'); // New line
    const rainbowColors = ["orange", "yellow", "green", "blue", "purple", "red", "orange", "yellow", "green", "blue", "purple"];
    let colorIndex = 0;
    let colorInterval = null;

    const generateLetter = () => {
        currentLetter = String.fromCharCode(Math.floor(Math.random() * 26) + 65);
        letterDisplay.textContent = currentLetter;
        faceDisplay.textContent = '';
        document.body.style.backgroundColor = 'white';
        mainDisplay.classList.remove('shake'); // New line
        mainDisplay.classList.remove('success'); // New line
        acceptInput = true;
    };

    const flashRainbow = () => {
        acceptInput = false;
        colorInterval = setInterval(() => {
            document.body.style.backgroundColor = rainbowColors[colorIndex];
            colorIndex = (colorIndex + 1) % rainbowColors.length;
        }, 100);
    };

    const stopRainbow = () => {
        clearInterval(colorInterval);
        colorInterval = null;
        colorIndex = 0;
    };

    const checkInput = (event) => {
        if (!acceptInput) {
            return;
        }
        if (event.key.toLowerCase() === currentLetter.toLowerCase()) {
            lastAttemptCorrect = true;
            faceDisplay.textContent = '😊';
            mainDisplay.classList.add('success'); // New line
            flashRainbow();
            setTimeout(() => {
                stopRainbow();
                generateLetter();
            }, 2000);
        } else {
            lastAttemptCorrect = false;
            faceDisplay.textContent = '☹️';
            mainDisplay.classList.add('shake'); // New line
            document.body.style.backgroundColor = 'red';
            acceptInput = false;
            setTimeout(generateLetter, 2000);
        }
    };

    document.addEventListener('keypress', checkInput);
    generateLetter();
});
