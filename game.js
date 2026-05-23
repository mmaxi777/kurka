document.addEventListener('DOMContentLoaded', function () {
    const preloadImages = ['png/chicken_parts/1.gif', 'png/chicken_parts/2.gif', 'png/chicken_parts/4.gif', 'png/chicken_parts/5.gif'].map(src => {
        const img = new Image();
        img.src = src;
        return new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
    });
    Promise.all(preloadImages).then(() => {
        console.log('[Preload] Все изображения предзагружены');
    }).catch(err => {
        console.error('[Preload] Ошибка предзагрузки:', err);
    });

    const gameField = document.getElementById('game-field');
    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    const playButton = document.getElementById('play-btn');
    const betInput = document.getElementById('bet-input');
    const minBetButton = document.getElementById('min-bet-btn');
    const maxBetButton = document.getElementById('max-bet-btn');
    const fastBetButtons = document.querySelectorAll('.fast-bet-btn');
    const balanceElement = document.querySelector('#balance span');

    const coefficients = {
        easy: [
            1.01, 1.03, 1.06, 1.10, 1.15, 1.19, 1.24, 1.30, 1.35, 1.42,
            1.48, 1.56, 1.65, 1.75, 1.85, 1.98, 2.12, 2.28, 2.47, 2.70,
            2.96, 3.28, 3.70, 4.11, 4.64, 5.39, 6.50, 8.36, 12.08, 23.24
        ],
        medium: [
            1.08, 1.21, 1.37, 1.56, 1.78, 2.05, 2.37, 2.77, 3.24, 3.85,
            4.62, 5.61, 6.91, 8.64, 10.99, 14.29, 18.96, 26.07, 37.24, 53.82,
            82.36, 137.59, 265.35, 638.82, 2457.00
        ],
        hard: [
            1.18, 1.46, 1.83, 2.31, 2.95, 3.82, 5.02, 6.66, 9.04, 12.52,
            17.74, 25.80, 38.71, 60.21, 97.34, 166.87, 305.94, 595.86, 1283.03,
            3267.64, 10898.54, 62162.09
        ],
        hardcore: [
            1.44, 2.21, 3.45, 5.53, 9.09, 15.30, 26.78, 48.70, 92.54, 185.08,
            391.25, 894.28, 2235.72, 6096.15, 18960.33, 72432.75, 379632.82, 3608855.25
        ]
    };

    let currentDifficulty = 'easy';
    let roadsCount = coefficients.easy.length;
    let carAnimationInterval;
    let activeCars = new Map();
    let isGameActive = false;
    let currentWin = 0;
    let currentMultiplier = 1;
    let gamesSinceLastWin = 0;
    let targetGamesUntilWin = Math.floor(Math.random() * 6) + 5;
    let currentRoad = 0;
    let roadWidth = 0;
    let scrollAnimationFrame = null;
    let chickenElement = null;
    let roadsWithBarrier = new Set();
    let activeBarriers = new Map();
    let isAutoMovingToSpecialRoad = false;
    let losingRoad = -1;
    let isLosingGame = false;
    let lastGoClickTime = 0;
    const GO_BUTTON_COOLDOWN = 500;

    document.addEventListener('keydown', function(event) {
        if (event.code === 'Space' || event.key === ' ') {
            event.preventDefault();
            if (!isGameActive && playButton && !playButton.disabled) {
                playButton.click();
            } else {
                const goButton = document.getElementById('go-btn');
                if (goButton && !goButton.disabled) {
                    goButton.click();
                }
            }
        }
    });
    let isGameInteractive = true;
    let isChickenMoving = false;
    let coefficientSign = null;
    let winPopup = null;
    let winAmountText = null;
    let areButtonsBlocked = false;
    let isMovingToLosingRoad = false;
    let lastKillerSpawnTime = 0;
    let lastKillerSpawnRoad = -1;

function handleResize() {
    calculateRoadWidth();
    updateChickenPosition();

    if (chickenElement && isGameActive) {
        if (isAutoMovingToSpecialRoad) {
            positionChickenOnSpecialRoad();
        } else {
            positionChickenOnRoad(currentRoad);
        }
    }
    
    updateCoefficientSign();
}

window.addEventListener('resize', handleResize);


function playClickSound() {
    try {
        const audio = new Audio('sounds/click.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио: ", e);
    }
}

minBetButton.addEventListener('click', () => {
    playClickSound();
    betInput.value = '0.01';
});

maxBetButton.addEventListener('click', () => {
    playClickSound();
    const currentBalance = getBalance();
    betInput.value = Math.min(200, currentBalance).toString();
});

fastBetButtons.forEach(button => {
    button.addEventListener('click', function () {
        playClickSound();
        const betAmount = button.getAttribute('data-bet');
        const currentBalance = getBalance();
        const numericBet = parseFloat(betAmount);
        
        if (numericBet <= currentBalance) {
            betInput.value = betAmount;
        }
    });
});

difficultyButtons.forEach(button => {
    button.addEventListener('click', () => {

        if (isGameActive) {
            resetGameUI();
        }
        
        difficultyButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentDifficulty = button.dataset.level;
        roadsCount = coefficients[currentDifficulty].length;
        
        hideChickenInstantly();
        
        gameField.scrollTo({
            left: 0,
            behavior: 'auto'
        });
        
        document.body.style.setProperty('--disable-transitions', 'none');
        
        renderRoads();
        
        setTimeout(() => {
            createChickenOnStart();
            
            setTimeout(() => {
                document.body.style.removeProperty('--disable-transitions');
            }, 100);
        }, 200);
    });
});

function playWinSound() {
    try {
        const audio = new Audio('sounds/win.webm');
        audio.volume = 0.6;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука выигрыша: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио выигрыша: ", e);
    }
}

function calculateRoadWidth() {
    const road = document.querySelector('.game-road:not(.image-road):not(.special-road)');
    if (road) {
        const style = getComputedStyle(road);
        const marginRight = parseFloat(style.marginRight) || 60;
        roadWidth = road.offsetWidth + marginRight;

        if (window.innerWidth < 1400) {
            roadWidth = roadWidth * 0.9;
        }
    }
}

function playDeadMachineSound() {
    try {
        const audio = new Audio('sounds/deadm.webm');
        audio.volume = 0.5;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука машины: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио машины: ", e);
    }
}

function playDeadChickenSound() {
    try {
        const audio = new Audio('sounds/deadchick.webm');
        audio.volume = 0.6;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука курицы: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио курицы: ", e);
    }
}

function playDeathSounds() {
    playDeadMachineSound();
    setTimeout(() => {
        playDeadChickenSound();
    }, 200);
}

    function showWinPopup(amount) {
        console.log('Showing win popup with amount:', amount);
        playWinSound();
        winPopup = document.getElementById('win-popup');
        winAmountText = document.getElementById('win-amount-text');
        
        if (!winPopup || !winAmountText) {
            console.error('Win popup elements not found!');
            return;
        }
        winAmountText.textContent = amount.toFixed(2);
        
        winPopup.classList.remove('show', 'hide');
        winPopup.style.display = 'none';

        setTimeout(() => {
            winPopup.style.display = 'flex';
            void winPopup.offsetWidth;
            winPopup.classList.add('show');           
            console.log('Win popup animation started');
        }, 50);
        setTimeout(() => {
            hideWinPopup();
        }, 1500);
    }


function playJumpSound() {
    try {
        const audio = new Audio('sounds/jump.mp3');
        audio.volume = 0.4;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука прыжка: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио прыжка: ", e);
    }
}

    function hideWinPopup() {
        if (!winPopup) return;
        
        winPopup.classList.remove('show');
        winPopup.classList.add('hide');
        
        setTimeout(() => {
            winPopup.classList.remove('hide');
            winPopup.style.display = 'none';
        }, 500);
    }

    function getBalance() {
        const savedBalance = localStorage.getItem('gameBalance');
        return savedBalance ? parseFloat(savedBalance) : 1000000;
    }

    function setBalance(newBalance) {
        localStorage.setItem('gameBalance', newBalance.toString());
        updateBalanceDisplay();
    }

    function updateBalanceDisplay() {
        const balance = getBalance();
        const formattedBalance = Number(balance.toFixed(2)).toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        balanceElement.textContent = formattedBalance;
    }

    function editBalance() {
        const currentBalance = getBalance();
        const newBalance = prompt('Введите новый баланс:', currentBalance);
        
        if (newBalance !== null) {
            const numericBalance = parseFloat(newBalance);
            if (!isNaN(numericBalance) && numericBalance >= 0) {
                setBalance(numericBalance);
            }
        }
    }

    function calculateRoadWidth() {
        const road = document.querySelector('.game-road:not(.image-road):not(.special-road)');
        if (road) {
            const style = getComputedStyle(road);
            roadWidth = road.offsetWidth + parseFloat(style.marginRight);
        }
    }

    function createChickenOnStart() {
    if (chickenElement) {
        positionChickenOnRoad(0);
        return;
    }
    
    chickenElement = document.createElement('div');
    chickenElement.className = 'chicken';
    chickenElement.style.transition = 'none';
    
    const chickenGifContainer = document.createElement('div');
    chickenGifContainer.className = 'chicken-gif-container';
    
    const idleGif = document.createElement('img');
    idleGif.src = 'png/chicken_parts/1.gif';
    idleGif.alt = 'Chicken Idle';
    idleGif.className = 'chicken-gif idle';
    idleGif.style.transition = 'none';
    
    chickenGifContainer.appendChild(idleGif);
    chickenElement.appendChild(chickenGifContainer);
    gameField.appendChild(chickenElement);
    
    positionChickenOnRoad(0);
    
    setTimeout(() => {
        if (chickenElement) {
            chickenElement.style.transition = '';
        }
    }, 50);
}

    function positionChickenOnRoad(roadIndex) {
        if (!chickenElement) return;
        
        const roads = document.querySelectorAll('.game-road');
        if (roadIndex >= roads.length) return;
        
        const targetRoad = roads[roadIndex];
        const roadRect = targetRoad.getBoundingClientRect();
        const gameFieldRect = gameField.getBoundingClientRect();
        const relativeLeft = roadRect.left - gameFieldRect.left + gameField.scrollLeft;
        const relativeTop = roadRect.top - gameFieldRect.top;
        const roadCenterX = relativeLeft + (roadRect.width / 2);
        const roadCenterY = relativeTop + (roadRect.height / 2);

        chickenElement.style.left = roadCenterX + 'px';
        chickenElement.style.top = roadCenterY + 'px';
    }

    function getRoadCenterCoords(roadIndex) {
        const roads = document.querySelectorAll('.game-road');
        if (roadIndex >= roads.length) return null;

        const targetRoad = roads[roadIndex];
        const roadRect = targetRoad.getBoundingClientRect();
        const gameFieldRect = gameField.getBoundingClientRect();
        const relativeLeft = roadRect.left - gameFieldRect.left + gameField.scrollLeft;
        const relativeTop = roadRect.top - gameFieldRect.top + gameField.scrollTop;
        const roadCenterX = relativeLeft + (roadRect.width / 2);
        const roadCenterY = relativeTop + (roadRect.height / 2);
        return { x: roadCenterX, y: roadCenterY };
    }

    function getElementCenterCoords(elem) {
        if (!elem) return null;
        const roadRect = elem.getBoundingClientRect();
        const gameFieldRect = gameField.getBoundingClientRect();

        const relativeLeft = roadRect.left - gameFieldRect.left + gameField.scrollLeft;
        const relativeTop = roadRect.top - gameFieldRect.top;

        const centerX = relativeLeft + (roadRect.width / 2);
        const centerY = relativeTop + (roadRect.height / 2);

        return { x: centerX, y: centerY };
    }

    function hideChickenInstantly() {
    if (chickenElement) {
        try {
            chickenElement.onclick = null;
            chickenElement.onmouseover = null;
            chickenElement.onmouseout = null;
            
            if (chickenElement.parentNode) {
                chickenElement.parentNode.removeChild(chickenElement);
            }
        } catch (e) {
            console.warn('hideChickenInstantly: ошибка при удалении курицы', e);
        }
        chickenElement = null;
    }
    
    document.querySelectorAll('.chicken').forEach(chicken => {
        try {
            if (chicken.parentNode) {
                chicken.parentNode.removeChild(chicken);
            }
        } catch (e) {
            console.warn('Удаление дубликата курицы:', e);
        }
    });
}

    function highlightNextManhole() {
        document.querySelectorAll('.manhole').forEach(manhole => {
            manhole.classList.remove('next-manhole');
        });

        if (isGameActive) {
            const coeffArray = coefficients[currentDifficulty];
            const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');

            if (currentRoad < coeffArray.length - 1) {
                if (currentRoad + 1 < roads.length) {
                    const nextRoad = roads[currentRoad + 1];
                    const nextManhole = nextRoad.querySelector('.manhole');
                    if (nextManhole) {
                        nextManhole.classList.add('next-manhole');
                    }
                }
            } 
        }
    }

    function updateCoefficientSign() {
        if (coefficientSign) {
            coefficientSign.remove();
            coefficientSign = null;
        }
        
        const coeffArray = coefficients[currentDifficulty];
        if (!isGameActive || 
            (isLosingGame && currentRoad === losingRoad) || 
            isAutoMovingToSpecialRoad ||
            currentRoad < 0 ||
            currentRoad >= coeffArray.length - 1) {
            return;
        }

        if (currentRoad >= 0 && currentRoad < coeffArray.length) {
            const currentCoefficient = coeffArray[currentRoad];
            let formattedCoefficient;
            if (Number.isInteger(currentCoefficient)) {
                formattedCoefficient = currentCoefficient.toFixed(2);
            } else {
                formattedCoefficient = parseFloat(currentCoefficient.toFixed(2)).toString();
                if (!formattedCoefficient.includes('.')) {
                    formattedCoefficient += '.00';
                } else {
                    const decimalPlaces = formattedCoefficient.split('.')[1].length;
                    if (decimalPlaces === 1) {
                        formattedCoefficient += '0';
                    }
                }
            }

            coefficientSign = document.createElement('div');
            coefficientSign.className = 'chicken-coefficient';
            
            const coefficientText = document.createElement('span');
            coefficientText.textContent = formattedCoefficient + '';
            coefficientSign.appendChild(coefficientText);

            adjustFontSize(coefficientSign, coefficientText);
            
            const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
            if (currentRoad < roads.length) {
                const currentRoadElement = roads[currentRoad];
                currentRoadElement.appendChild(coefficientSign);
            }
        }
    }

    function adjustFontSize(container, textElement) {
        const text = textElement.textContent;

        container.classList.remove('small-font', 'very-small-font', 'tiny-font', 'mini-font');

        if (text.length <= 6) {
        } else if (text.length <= 7) {
            container.classList.add('small-font');
        } else if (text.length <= 8) {
            container.classList.add('very-small-font');
        } else if (text.length <= 9) {
            container.classList.add('tiny-font');
        } else {
            container.classList.add('mini-font');
        }
        setTimeout(() => {
            const containerRect = container.getBoundingClientRect();
            const textRect = textElement.getBoundingClientRect();

            if (textRect.width > containerRect.width * 0.85) {
                if (container.classList.contains('mini-font')) {
                } else if (container.classList.contains('tiny-font')) {
                    container.classList.remove('tiny-font');
                    container.classList.add('mini-font');
                } else if (container.classList.contains('very-small-font')) {
                    container.classList.remove('very-small-font');
                    container.classList.add('tiny-font');
                } else if (container.classList.contains('small-font')) {
                    container.classList.remove('small-font');
                    container.classList.add('very-small-font');
                } else {
                    container.classList.add('small-font');
                }
            }
        }, 50);
    }


function moveChickenToNextRoad() {
    if (!chickenElement || isChickenMoving) return;

    isChickenMoving = true;
    playJumpSound();
    
    const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
    const coeffArray = coefficients[currentDifficulty];
    const chickenGif = chickenElement.querySelector('.chicken-gif');
    
    if (chickenGif) {
        const resetGif = (gif, src) => {
            gif.style.display = 'none';
            void gif.offsetWidth;
            gif.src = src;
            gif.style.display = 'block';
        };
        
        resetGif(chickenGif, 'png/chicken_parts/2.gif');

        setTimeout(() => {
            resetGif(chickenGif, 'png/chicken_parts/1.gif');
        }, 400);
    }

    if (currentRoad < roads.length) {
        void chickenElement.offsetWidth;

        scrollToCurrentRoad();
        
        const targetIndex = currentRoad + 1;
        const endCoords = getRoadCenterCoords(targetIndex);

        if (!endCoords) {
            chickenElement.style.transition = 'left 0.37s linear, top 0.37s ease-in-out';
            positionChickenOnRoad(targetIndex);
        } else {
            const duration = 370;
            const half = duration / 2;
            const arcHeight = 80;

            chickenElement.style.transition = `left ${duration}ms linear, top ${half}ms ease-out`;
            chickenElement.style.left = endCoords.x + 'px';
            chickenElement.style.top = (endCoords.y - arcHeight) + 'px';
            
            setTimeout(() => {
                chickenElement.style.transition = `top ${half}ms ease-in`;
                chickenElement.style.top = endCoords.y + 'px';
            }, half);
        }

        setTimeout(() => {
            updateCoefficientSign();
        }, 50);

        const isCurrentRoadLosing = isLosingGame && currentRoad === losingRoad;
        const isNextRoadLosing = isLosingGame && (currentRoad + 1) === losingRoad;
        const shouldAddBarrier = !isCurrentRoadLosing && !isNextRoadLosing;

        if (shouldAddBarrier && currentRoad < coeffArray.length - 1) {
            addBarrierToRoad(currentRoad);
        }

        if (isLosingGame && currentRoad === losingRoad - 1) {
            hideManholeAt(currentRoad);
            if (!roadsWithBarrier.has(currentRoad)) {
                addBarrierToRoad(currentRoad);
            }
        }

        if (currentRoad > 0) {
            const targetRoadForGolden = currentRoad - 1;
            if (targetRoadForGolden !== losingRoad) {
                addGoldenManholeToRoad(targetRoadForGolden);
            }
        }

        highlightNextManhole();

        setTimeout(() => {
            isChickenMoving = false;
            if (isGameActive && !isAutoMovingToSpecialRoad && !isMovingToLosingRoad) {
                unblockGameButtons();
            }
        }, 370);
    } else {
        isChickenMoving = false;
    }
}

function positionChickenOnSpecialRoad() {
    if (!chickenElement) return;
    
    const specialRoad = document.querySelector('.special-road');
    if (!specialRoad) return;
    
    const roadRect = specialRoad.getBoundingClientRect();
    const gameFieldRect = gameField.getBoundingClientRect();

    const relativeLeft = roadRect.left - gameFieldRect.left + gameField.scrollLeft;
    const relativeTop = roadRect.top - gameFieldRect.top;

    const roadCenterX = relativeLeft + (roadRect.width / 2);
    const roadCenterY = relativeTop + (roadRect.height / 2);
    
    chickenElement.style.left = (roadCenterX - 30) + 'px';
    chickenElement.style.top = (roadCenterY - 30) + 'px';
    chickenElement.style.transform = 'translate(-50%, -50%)';
    
    console.log('Курица позиционирована на спец-дорожке:', chickenElement.style.left, chickenElement.style.top);
}

function updateChickenPosition() {

    if (isChickenMoving) return;

    if (chickenElement && isGameActive) {
        if (isAutoMovingToSpecialRoad) {
            positionChickenOnSpecialRoad();
        } else {
            positionChickenOnRoad(currentRoad + 1);
        }
    } else if (chickenElement) {
        positionChickenOnRoad(0);
    }
}

    gameField.addEventListener('scroll', updateChickenPosition);
    window.addEventListener('resize', updateChickenPosition);

function addBarrierToRoad(roadIndex) {
    console.log(`Попытка добавления шлагбаума: roadIndex=${roadIndex}, losingRoad=${losingRoad}, isLosingGame=${isLosingGame}`);

    if (isLosingGame) {
        if (roadIndex === losingRoad) {
            console.log(`Шлагбаум НЕ добавляется: проигрышная дорога (${roadIndex})`);
            return;
        }
    }

    const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
    if (roadIndex >= roads.length) return;

    const road = roads[roadIndex];

    if (roadsWithBarrier.has(roadIndex)) {
        return;
    }

    const barrier = document.createElement('div');
    barrier.className = 'barrier barrier-falling';
    barrier.innerHTML = '<img src="png/barer.png" alt="Barrier">';

    road.appendChild(barrier);
    barrier.style.pointerEvents = 'none';
    barrier.style.zIndex = '5';
    if (chickenElement) {
        chickenElement.style.zIndex = '1000';
    }
    roadsWithBarrier.add(roadIndex);
    activeBarriers.set(roadIndex, barrier);

    if (!hideManholeAt(roadIndex)) {
        const manhole = road.querySelector('.manhole');
        if (manhole) {
            manhole.style.display = 'none';
        }
    }
    stopCarsOnRoad(roadIndex);
}
    function stopCarsOnRoad(roadIndex) {
    const carData = activeCars.get(roadIndex);
    if (carData) {
        const car = carData.element;

        if (carData.timeout) {
            clearTimeout(carData.timeout);
        }

        car.classList.remove('car-moving');
        car.classList.add('car-stopped');

        playStopCarSound();

        setTimeout(() => {
            if (car.parentNode) {
                car.style.top = '20%';
                car.style.animation = 'none';
                car.style.zIndex = '3';
            }
        }, 50);
    }
}

    function addGoldenManholeToRoad(roadIndex) {
        console.log(`Вызов addGoldenManholeToRoad для дороги ${roadIndex}`);
        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        if (roadIndex < 0 || roadIndex >= roads.length) {
            console.log(`Ошибка: roadIndex ${roadIndex} вне допустимого диапазона (0-${roads.length-1})`);
            return;
        }
        
        const road = roads[roadIndex];
        console.log(`Найдена дорога для индекса ${roadIndex}`);

        const existingGoldenManhole = road.querySelector('.golden-manhole');
        if (existingGoldenManhole) {
            console.log(`На дороге ${roadIndex} уже есть золотой люк`);
            return;
        }

        const goldenManhole = document.createElement('div');
        goldenManhole.className = 'golden-manhole';

        Object.assign(goldenManhole.style, {
            display: 'block',
            position: 'absolute',
            bottom: '40px',
            left: '24%',
            width: '160px',
            height: '160px',
            transform: 'translateY(-68%) scaleX(1)',
            opacity: '1',
            zIndex: '3'
        });

        const img = document.createElement('img');
        img.src = 'png/winmonet.png';
        img.alt = 'Golden Manhole';
        img.style.width = '100%';
        img.style.height = '100%';
        goldenManhole.appendChild(img);

        road.appendChild(goldenManhole);
        console.log(`Добавлен новый золотой люк на дорогу ${roadIndex}`);

        requestAnimationFrame(() => {
            goldenManhole.classList.add('animate');
            console.log(`Анимация золотого люка запущена на дороге ${roadIndex}`);
        }, 50);
    }

    function playStopCarSound() {
    try {
        const audio = new Audio('sounds/stopcar.mp3');
        audio.volume = 0.6;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука остановки машины: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио остановки машины: ", e);
    }
}


    function scrollToCurrentRoad() {
    if (roadWidth === 0) {
        calculateRoadWidth();
    }

    if (currentRoad >= 1) {
        let targetScroll = currentRoad * roadWidth;
        const maxScroll = gameField.scrollWidth - gameField.clientWidth;
        if (targetScroll > maxScroll) targetScroll = maxScroll;
        
        gameField.scrollTo({
            left: targetScroll,
            behavior: 'smooth'
        });
        
        return new Promise((resolve) => {
            const checkScroll = () => {
                const currentScroll = gameField.scrollLeft;
                if (Math.abs(currentScroll - targetScroll) <= 10) {
                    resolve();
                } else {
                    requestAnimationFrame(checkScroll);
                }
            };
            
            setTimeout(() => {
                checkScroll();
            }, 50);
        });
    }
    return Promise.resolve();
}

function smoothScrollTo(targetScroll, duration = 370) {
    if (scrollAnimationFrame) {
        cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = null;
    }

    const startScroll = gameField.scrollLeft;
    const change = targetScroll - startScroll;
    if (change === 0) return;
    
    const startTime = performance.now();
    
    function animateScroll(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        gameField.scrollLeft = startScroll + change * progress;
        
        if (progress < 1) {
            scrollAnimationFrame = requestAnimationFrame(animateScroll);
        } else {
            gameField.scrollLeft = targetScroll;
            scrollAnimationFrame = null;
        }
    }
    
    scrollAnimationFrame = requestAnimationFrame(animateScroll);
}

    function scrollToStart() {
        gameField.scrollTo({
            left: 0,
            behavior: 'smooth'
        });
    }

    function startGameUI() {

        forceClearLosingRoad();

    if (isLosingGame && losingRoad >= 0) {
        removeCarsFromLosingRoad();
    }
        unblockGameButtons();
        const playButton = document.getElementById('play-btn');
        const controlBlock = playButton.parentNode;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'game-buttons-container';

        const winButton = document.createElement('button');
        winButton.id = 'win-btn';
        winButton.className = 'win-button';
        winButton.textContent = '0';

        const goButton = document.createElement('button');
        goButton.id = 'go-btn';
        goButton.className = 'go-button';
        goButton.textContent = 'Go';

        controlBlock.innerHTML = '';
        controlBlock.appendChild(buttonsContainer);
        buttonsContainer.appendChild(winButton);
        buttonsContainer.appendChild(goButton);
        
        isGameActive = true;
        currentRoad = 0;
        currentWin = 0;
        currentMultiplier = 1;
        {


            const losingChance = 0.00; //ВОТ ТУТ ШАНС ТО ЧТО ИГРА БУДЕТ ПРОИГРЫШНАЯ(то есть если ставищь 0.0 то всегда будешь доходить до конца, 1.0 то до конца никогда не дойдешь, логика такая)
            isLosingGame = Math.random() < losingChance;
            if (isLosingGame) {
                const coeffArray = coefficients[currentDifficulty];
                if (coeffArray.length > 1) {
                    losingRoad = Math.floor(Math.random() * (coeffArray.length - 1)) + 1;
                } else {
                    losingRoad = 1;
                }
            } else {
                losingRoad = -1;
            }
            if (isLosingGame && losingRoad >= 0) {
                try {
                    stopCarsOnRoad(losingRoad);
                } catch (e) {
                    console.warn('Не удалось остановить машины на проигрышной дороге', e);
                }
            }
        }

    console.log(`Начало игры. Режим: ${currentDifficulty}, Проигрышная дорожка: ${isLosingGame ? losingRoad : 'нет'}`);
        roadsWithBarrier.clear();
        activeBarriers.clear();
        document.querySelectorAll('.barrier').forEach(el => el.remove());

        document.querySelectorAll('.manhole').forEach(manhole => {
            manhole.style.display = 'flex';
        });
        
        setTimeout(() => {
            moveChickenToNextRoad();
        }, 80);

        setTimeout(() => {
            updateCoefficientSign();
        }, 100);
        
        highlightNextManhole();
        
        const betAmount = parseFloat(betInput.value);
        const coeffArray = coefficients[currentDifficulty];
        if (coeffArray.length > 0) {
            currentMultiplier = coeffArray[0];
            currentWin = betAmount * currentMultiplier;
        }
        
        updateWinDisplay();

        goButton.addEventListener('click', goButtonHandler);
        winButton.addEventListener('click', takeWinHandler);

        setTimeout(() => {
            calculateRoadWidth();
            gameField.scrollTo({ left: 0, behavior: 'smooth' });
        }, 100);
    }

    function takeWinHandler() {
    playClickSound();
    if (areButtonsBlocked) {
        console.log("Кнопка Take Win заблокирована");
        return;
    }
    
    console.log('Take win handler called, currentWin:', currentWin);
    
    if (currentWin > 0) {
        const currentBalance = getBalance();
        setBalance(currentBalance + currentWin);

        console.log('Calling showWinPopup with amount:', currentWin);
        showWinPopup(currentWin);
        
        blockGameButtons();
        
        setTimeout(() => {
            hideChickenInstantly();
            gamesSinceLastWin = 0;
            targetGamesUntilWin = Math.floor(Math.random() * 6) + 7;
            resetGameUI();
        }, 2000);
    } else {
        resetGameUI();
    }
}

function removeCarsFromLosingRoad() {
    if (isLosingGame && losingRoad >= 0) {
        const carData = activeCars.get(losingRoad);
        if (carData) {
            if (carData.timeout) {
                clearTimeout(carData.timeout);
            }
            if (carData.element && carData.element.parentNode) {
                carData.element.parentNode.removeChild(carData.element);
            }
            activeCars.delete(losingRoad);
        }
    }
}

    function goButtonHandler() {
    const now = Date.now();
    
    if (now - lastGoClickTime < GO_BUTTON_COOLDOWN) {
        console.log('[Button] Кнопка Go в режиме задержки');
        return;
    }
    
    playClickSound();
    console.log('[Button] Нажата кнопка Go');
    
    if (!isGameActive || isAutoMovingToSpecialRoad || areButtonsBlocked || isChickenMoving) {
        console.log('[Button] Кнопка Go заблокирована');
        return;
    }
    
    lastGoClickTime = now;
    
    console.log('[Button] Начинаем обработку нажатия Go');
    blockGameButtons();
    
    const coeffArray = coefficients[currentDifficulty];

    if (currentRoad >= coeffArray.length - 1) {
        if (coefficientSign) {
            coefficientSign.remove();
            coefficientSign = null;
        }
        if (isLosingGame && losingRoad === coeffArray.length - 1) {
            console.log("Проигрыш на последней дорожке с коэффициентом");
            currentRoad++;
            moveChickenToLosingRoad();
        } else {
            moveChickenToSpecialRoad();
        }
        return;
    }
    
    gamesSinceLastWin++;

    if (isLosingGame && currentRoad + 1 === losingRoad) {
        console.log(`Следующая дорожка ${currentRoad + 1} является проигрышной`);
        currentRoad++;
        moveChickenToLosingRoad();
        return;
    }
    
    currentRoad++;
    currentMultiplier = coeffArray[currentRoad];
    currentWin = parseFloat(betInput.value) * currentMultiplier;
    updateWinDisplay();

    moveChickenToNextRoad();
    
    updateCoefficientSign();

    if (currentRoad >= coeffArray.length - 1) {
        moveChickenToSpecialRoad();
    }
}

   function moveChickenToLosingRoad() {
    if (!chickenElement || isChickenMoving) return;

    isMovingToLosingRoad = true;
    isChickenMoving = true;
    playJumpSound();

    const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');

    if (currentRoad < roads.length) {
        scrollToCurrentRoad();
        
        if (coefficientSign) {
            coefficientSign.remove();
            coefficientSign = null;
        }

        document.querySelectorAll('.manhole').forEach(manhole => {
            manhole.classList.remove('next-manhole');
        });
        
        if (currentRoad > 0) {
            const prevRoad = currentRoad - 1;
            if (prevRoad !== losingRoad) {
                addGoldenManholeToRoad(prevRoad);
            }
        }

        if (currentRoad < roads.length) {
            hideManholeAt(currentRoad);
        }

        const targetIndex = currentRoad + 1;
        const endCoords = getRoadCenterCoords(targetIndex);
        const duration = 370;
        const half = duration / 2;
        const arcHeight = 28;

        if (!endCoords) {
            chickenElement.style.transition = 'left 0.37s linear, top 0.37s ease-in-out';
            positionChickenOnRoad(targetIndex);
            setTimeout(() => {
                isChickenMoving = false;
                isMovingToLosingRoad = false;
                createKillerCar(currentRoad);
                chickenHitByCar();
            }, 400);
        } else {
            chickenElement.style.transition = `left ${duration}ms linear, top ${half}ms ease-out`;
            chickenElement.style.left = endCoords.x + 'px';
            chickenElement.style.top = (endCoords.y - arcHeight) + 'px';

            setTimeout(() => {
                chickenElement.style.transition = `top ${half}ms ease-in`;
                chickenElement.style.top = endCoords.y + 'px';
            }, half);

            setTimeout(() => {
                isChickenMoving = false;
                isMovingToLosingRoad = false;
                createKillerCar(currentRoad);
                chickenHitByCar();
            }, duration);
        }
    } else {
        isChickenMoving = false;
        isMovingToLosingRoad = false;
    }
}

function playSpecialWinSound() {
    try {
        const audio = new Audio('sounds/win1.webm');
        audio.volume = 0.7;
        audio.play().catch(e => console.log("Ошибка воспроизведения звука специального выигрыша: ", e));
    } catch (e) {
        console.log("Ошибка создания аудио специального выигрыша: ", e);
    }
}

    function chickenHitByCar() {
    if (!chickenElement) return;

    console.log("Запуск анимации смерти курицы с 4.gif");

    playDeathSounds();
    
    if (coefficientSign) {
        coefficientSign.remove();
        coefficientSign = null;
    }

    blockGameButtons();
    
    if (chickenElement.parentNode) {
        chickenElement.parentNode.removeChild(chickenElement);
        gameField.appendChild(chickenElement);
    }

    chickenElement.style.zIndex = '900';

    const chickenImage = chickenElement.querySelector('.chicken-gif');
    if (chickenImage) {
        const currentLeft = chickenElement.style.left;
        const currentTop = chickenElement.style.top;
        
        chickenImage.src = 'png/chicken_parts/4.gif';
        
        console.log("Курица заменена на 4.gif (анимация смерти)");

        chickenElement.style.left = currentLeft;
        chickenElement.style.top = currentTop;
        chickenElement.style.transform = 'translate(-43%, -20%)';
        chickenElement.style.width = '30%';
        chickenElement.style.height = '30%';
        chickenElement.style.opacity = '1';
        
        if (!(lastKillerSpawnRoad === currentRoad && (Date.now() - lastKillerSpawnTime) < 800)) {
            createKillerCar(currentRoad);
        }

        setTimeout(() => {
            console.log("Анимация смерти завершена, сбрасываем игру");

            currentWin = 0;
            updateWinDisplay();

            resetGameUI();
        }, 1000);
    } else {
        console.error("Не найден элемент .chicken-gif у курицы");
        resetGameUI();
    }
}


    function createKillerCar(roadIndex) {
        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        if (roadIndex >= roads.length) return;
        
        const road = roads[roadIndex];
        const roadRect = road.getBoundingClientRect();
        const gameFieldRect = gameField.getBoundingClientRect();

        const killerCar = document.createElement('div');
        killerCar.className = 'car killer-car';

        const randomCar = Math.floor(Math.random() * 8) + 1;
        killerCar.innerHTML = `<img src="png/${randomCar}.png" alt="Killer Car">`;
        
        gameField.appendChild(killerCar);

        const relativeLeft = roadRect.left - gameFieldRect.left + gameField.scrollLeft;
        const relativeTop = roadRect.top - gameFieldRect.top;

        const roadCenterX = relativeLeft + (roadRect.width / 2);
        killerCar.style.left = roadCenterX + 'px';
        killerCar.style.transform = 'translateX(-30%)';

        if (chickenElement) {
            chickenElement.style.zIndex = '900';
        }
        killerCar.style.zIndex = '1200';

        killerCar.classList.add('car-moving');

        lastKillerSpawnTime = Date.now();
        lastKillerSpawnRoad = roadIndex;

        setTimeout(() => {
            if (killerCar.parentNode) {
                killerCar.parentNode.removeChild(killerCar);
            }
        }, 350);
    }

    function moveChickenToSpecialRoad() {
    if (!chickenElement || !isGameActive) return;
    
    isAutoMovingToSpecialRoad = true;
    blockGameButtons();
    if (coefficientSign) {
        coefficientSign.remove();
        coefficientSign = null;
    }
    
    const coeffArray = coefficients[currentDifficulty];
    const lastRoadIndex = coeffArray.length - 1;
    
    if (!isLosingGame || losingRoad !== lastRoadIndex) {
        addBarrierToRoad(lastRoadIndex);
    }

    document.querySelectorAll('.manhole').forEach(manhole => {
        manhole.classList.remove('next-manhole');
    });

    const specialRoad = document.querySelector('.special-road');
    if (specialRoad) {
        showWinPopup(currentWin);
        
        setTimeout(() => {
            if (!hideManholeAt(lastRoadIndex)) {
                console.log(`Не удалось скрыть люк на последней дорожке ${lastRoadIndex}`);
            }

            const gameField = document.getElementById('game-field');
            
            playSpecialWinSound();
            
            try {
                if (chickenElement) {
                    const chickenImage = chickenElement.querySelector('.chicken-gif');
                    if (chickenImage) {
                        chickenImage.src = 'png/chicken_parts/5.gif';
                        console.log('Установлена анимация победы 5.gif для специальной дорожки');
                    }
                }
            } catch (e) {
                console.warn('Не удалось поменять гифку курицы на 5.gif', e);
            }

            const duration = 2000;
            const half = duration / 2;
            const arcHeight = 36;

            const endCoords = getElementCenterCoords(specialRoad);

            if (endCoords) {
                chickenElement.style.transition = `left ${duration}ms linear, top ${half}ms ease-out`;
                chickenElement.style.left = endCoords.x + 'px';
                chickenElement.style.top = (endCoords.y - arcHeight) + 'px';

                setTimeout(() => {
                    chickenElement.style.transition = `top ${half}ms ease-in`;
                    chickenElement.style.top = endCoords.y + 'px';
                }, half);

                setTimeout(() => {
                    if (chickenElement.parentNode) {
                        chickenElement.parentNode.removeChild(chickenElement);
                    }

                    specialRoad.appendChild(chickenElement);

                    positionChickenOnSpecialRoad();

                    chickenElement.style.display = 'block';
                    chickenElement.style.visibility = 'visible';
                    chickenElement.style.opacity = '1';
                    chickenElement.style.zIndex = '1000';
                    chickenElement.style.transition = 'none';

                    addGoldenManholeToRoad(lastRoadIndex);

                    setTimeout(() => {
                        const maxScroll = gameField.scrollWidth - gameField.clientWidth;
                        gameField.scrollTo({
                            left: Math.min(maxScroll, gameField.scrollWidth * 0.0),
                            behavior: 'smooth'
                        });
                    }, 100);

                    setTimeout(() => {
                        hideChickenInstantly();

                        const currentBalance = getBalance();
                        setBalance(currentBalance + currentWin);

                        gamesSinceLastWin = 0;
                        targetGamesUntilWin = Math.floor(Math.random() * 6) + 7;

                        resetGameUI();
                    }, 100);

                }, duration);

            } else {
                if (chickenElement.parentNode) {
                    chickenElement.parentNode.removeChild(chickenElement);
                }
                specialRoad.appendChild(chickenElement);
                positionChickenOnSpecialRoad();
                chickenElement.style.display = 'block';
                chickenElement.style.visibility = 'visible';
                chickenElement.style.opacity = '1';
                chickenElement.style.zIndex = '1000';
                chickenElement.style.transition = 'none';
                addGoldenManholeToRoad(lastRoadIndex);

                try {
                    if (chickenElement) {
                        const chickenImage = chickenElement.querySelector('.chicken-gif');
                        if (chickenImage) {
                            chickenImage.src = 'png/chicken_parts/5.gif';
                        }
                    }
                } catch (e) {
                    console.warn('Не удалось поменять гифку на 5.gif в fallback', e);
                }

                setTimeout(() => {
                    const maxScroll = gameField.scrollWidth - gameField.clientWidth;
                    gameField.scrollTo({
                        left: Math.min(maxScroll, gameField.scrollWidth * 0.9),
                        behavior: 'smooth'
                    });
                }, 100);

                setTimeout(() => {
                    hideChickenInstantly();
                    const currentBalance = getBalance();
                    setBalance(currentBalance + currentWin);
                    gamesSinceLastWin = 0;
                    targetGamesUntilWin = Math.floor(Math.random() * 6) + 7;
                    resetGameUI();
                }, 100);
            }

        }, 600);
    } else {
        showWinPopup(currentWin);
        const currentBalance = getBalance();
        setBalance(currentBalance + currentWin);
        gamesSinceLastWin = 0;
        targetGamesUntilWin = Math.floor(Math.random() * 6) + 7;
        resetGameUI();
    }
}
    function blockGameButtons() {
    areButtonsBlocked = true;
    const goButton = document.getElementById('go-btn');
    const winButton = document.getElementById('win-btn');
    
    if (goButton) {
        goButton.disabled = true;
        goButton.style.opacity = '0.7';
        goButton.style.cursor = 'not-allowed';
    }
    
    if (winButton) {
        winButton.disabled = true;
        winButton.style.opacity = '0.7';
        winButton.style.cursor = 'not-allowed';
    }
}

    function unblockGameButtons() {
    const now = Date.now();
    if (now - lastGoClickTime < GO_BUTTON_COOLDOWN) {
        setTimeout(unblockGameButtons, GO_BUTTON_COOLDOWN - (now - lastGoClickTime));
        return;
    }
    
    areButtonsBlocked = false;
    const goButton = document.getElementById('go-btn');
    const winButton = document.getElementById('win-btn');
    
    if (goButton) {
        goButton.disabled = false;
        goButton.style.opacity = '1';
        goButton.style.cursor = 'pointer';
    }
    
    if (winButton) {
        winButton.disabled = false;
        winButton.style.opacity = '1';
        winButton.style.cursor = 'pointer';
    }
}

    function updateWinDisplay() {
        const winButton = document.getElementById('win-btn');
        if (winButton) {
            winButton.textContent = currentWin.toFixed(2);
        }
    }

    function resetGameUI() {
    console.log("Сброс игры...");



    if (isLosingGame && losingRoad >= 0) {
        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        if (losingRoad < roads.length) {
            const losingRoadElement = roads[losingRoad];
            const carsOnLosingRoad = losingRoadElement.querySelectorAll('.car');
            carsOnLosingRoad.forEach(car => car.remove());
        }
    }

    unblockGameButtons();

    if (carAnimationInterval) {
        clearInterval(carAnimationInterval);
        carAnimationInterval = null;
    }
    
    if (scrollAnimationFrame) {
        cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = null;
    }
    
    gameField.scrollTo({
        left: 0,
        behavior: 'auto'
    });
    
    hideChickenInstantly();
    
    gameField.scrollTo({
        left: 0,
        behavior: 'auto'
    });
    
    document.querySelectorAll('.golden-manhole').forEach(manhole => {
        manhole.remove();
    });

    if (coefficientSign) {
        coefficientSign.remove();
        coefficientSign = null;
    }

    hideWinPopup();
    
    isGameActive = false;
    isAutoMovingToSpecialRoad = false;
    isMovingToLosingRoad = false;
    areButtonsBlocked = false;
    isChickenMoving = false;
    losingRoad = -1;
    isLosingGame = false;
    currentRoad = 0;
    
    const controlBlock = document.querySelector('.control-block:last-child');
    if (controlBlock) {
        controlBlock.innerHTML = '<button id="play-btn">Play</button>';
        const newPlayButton = document.getElementById('play-btn');
        newPlayButton.addEventListener('click', playButtonHandler);
    }
    
    activeCars.forEach((carData, roadIndex) => {
        if (carData.timeout) {
            clearTimeout(carData.timeout);
        }
    });
    activeCars.clear();
    
    if (chickenElement) {
    chickenElement.style.transition = 'none';
    positionChickenOnRoad(0);
    
    setTimeout(() => {
        if (chickenElement) {
            chickenElement.style.transition = '';
        }
    }, 50);
}
    
    document.querySelectorAll('.barrier, .golden-manhole, .car, .killer-car').forEach(el => {
        el.style.transition = 'none !important';
        el.style.animation = 'none !important';
        el.remove();
    });
    roadsWithBarrier.clear();
    activeBarriers.clear();
    
    document.querySelectorAll('.manhole').forEach(manhole => {
        manhole.classList.remove('next-manhole');
        manhole.style.display = 'flex';
        manhole.style.transition = 'none !important';
    });
    
    unblockGameButtons();
    const currentScroll = gameField.scrollLeft;
    
    document.body.style.setProperty('--disable-transitions', 'none');
    
    renderRoads();
    
    gameField.scrollTo({
        left: 0,
        behavior: 'auto'
    });
    
    setTimeout(() => {
        calculateRoadWidth();
        startRandomCarAnimation();
        
        setTimeout(() => {
            document.body.style.removeProperty('--disable-transitions');
        }, 100);
    }, 50);
    
    console.log("Игра сброшена, курица возвращена на нулевую дорожку");
}

    function forceChickenAbove() {
        const chicken = document.querySelector('.chicken');
        if (chicken) {
            chicken.style.zIndex = '9999';
            chicken.style.transform = 'translate(-50%, -50%) translateZ(100px)';
            chicken.style.isolation = 'isolate';
            console.log('Курица принудительно поднята');
        }
    }

    function playButtonHandler() {
    playClickSound();
    
    const currentBalance = getBalance();
    const betAmount = parseFloat(betInput.value);
    
    if (isNaN(betAmount) || betAmount <= 0 || betAmount > currentBalance) {
        return;
    }
    
    setBalance(currentBalance - betAmount);
    startGameUI();
}

    function getAllRoads() {
        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        const allRoads = [];
        
        roads.forEach((road, index) => {
            allRoads.push({
                element: road,
                index: index
            });
        });
        
        return allRoads;
    }

function getAvailableRoadsForCars() {
    const allRoads = getAllRoads();
    return allRoads.filter(road => {
        if (roadsWithBarrier.has(road.index)) return false;
        if (isLosingGame && road.index === losingRoad) return false;
        if (activeCars.has(road.index)) return false;
        return true;
    });
}

function forceClearLosingRoad() {
    if (isLosingGame && losingRoad >= 0) {
        console.log(`ПРИНУДИТЕЛЬНАЯ ОЧИСТКА проигрышной дорожки ${losingRoad}`);

        const carData = activeCars.get(losingRoad);
        if (carData) {
            console.log(`Удалена машина из activeCars на дорожке ${losingRoad}`);
            if (carData.timeout) {
                clearTimeout(carData.timeout);
            }
            if (carData.element && carData.element.parentNode) {
                carData.element.parentNode.removeChild(carData.element);
            }
            activeCars.delete(losingRoad);
        }

        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        if (losingRoad < roads.length) {
            const losingRoadElement = roads[losingRoad];
            const carsOnLosingRoad = losingRoadElement.querySelectorAll('.car');
            console.log(`Найдено ${carsOnLosingRoad.length} машин на проигрышной дорожке для удаления`);
            carsOnLosingRoad.forEach((car, index) => {
                if (car.parentNode) {
                    car.parentNode.removeChild(car);
                    console.log(`Удалена машина #${index + 1} с проигрышной дорожки`);
                }
            });
        }

        setTimeout(() => {
            const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
            if (losingRoad < roads.length) {
                const losingRoadElement = roads[losingRoad];
                const remainingCars = losingRoadElement.querySelectorAll('.car');
                if (remainingCars.length > 0) {
                    console.log(`Обнаружены оставшиеся машины (${remainingCars.length}) на проигрышной дорожке, удаляем...`);
                    remainingCars.forEach(car => {
                        if (car.parentNode) {
                            car.parentNode.removeChild(car);
                        }
                    });
                }
            }
        }, 100);
    }
}

    function createCarOnRoad(roadIndex) {

        if (isLosingGame && roadIndex === losingRoad) {
        console.log(`Предотвращено создание машины на проигрышной дорожке ${roadIndex}`);
        return;
    }
        if (roadsWithBarrier.has(roadIndex)) {
            return;
        }

        if (isLosingGame && roadIndex === losingRoad) {
            return;
        }
        
        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        if (roadIndex >= roads.length) return;
        
        const road = roads[roadIndex];
        const car = document.createElement('div');
        car.className = 'car';
        
        const randomCar = Math.floor(Math.random() * 8) + 1;
        car.innerHTML = `<img src="png/${randomCar}.png" alt="Car ${randomCar}">`;
        
        road.appendChild(car);
        
        car.classList.add('car-moving');
        
        const animationTimeout = setTimeout(() => {
            if (!car.classList.contains('car-stopped') && car.parentNode) {
                car.parentNode.removeChild(car);
            }
            activeCars.delete(roadIndex);
        }, 1500);
        
        activeCars.set(roadIndex, {
            element: car,
            timeout: animationTimeout
        });
    }

    function hideManholeAt(roadIndex) {
        const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
        if (roadIndex < 0 || roadIndex >= roads.length) return false;
        const road = roads[roadIndex];
        const manhole = road.querySelector('.manhole:not(.golden-manhole)');
        if (manhole) {
            manhole.style.display = 'none';
            console.log(`hideManholeAt: скрыт люк на дороге ${roadIndex}`);
            return true;
        }
        console.log(`hideManholeAt: люк не найден на дороге ${roadIndex}`);
        return false;
    }

    function startRandomCarAnimation() {
    if (carAnimationInterval) {
        clearInterval(carAnimationInterval);
    }
    
    carAnimationInterval = setInterval(() => {
        if (isLosingGame && losingRoad >= 0) {
            const roads = document.querySelectorAll('.game-road:not(.image-road):not(.special-road)');
            if (losingRoad < roads.length) {
                const losingRoadElement = roads[losingRoad];
                const carsOnLosingRoad = losingRoadElement.querySelectorAll('.car');
                carsOnLosingRoad.forEach(car => {
                    if (car.parentNode) {
                        car.parentNode.removeChild(car);
                    }
                });
            }
        }
        
        const availableRoads = getAvailableRoadsForCars();
        if (availableRoads.length === 0) return;
        
        const carsToSpawn = Math.floor(Math.random() * 15) + 1;
        
        for (let i = 0; i < carsToSpawn; i++) {
            setTimeout(() => {
                const filteredRoads = availableRoads.filter(road => 
                    !activeCars.has(road.index) && 
                    !(isLosingGame && road.index === losingRoad)
                );
                
                if (filteredRoads.length > 0) {
                    const randomRoad = filteredRoads[Math.floor(Math.random() * filteredRoads.length)];
                    createCarOnRoad(randomRoad.index);
                }
            }, i * 300);
        }
    }, 1500);
}

    function renderRoads() {
    const currentActiveCars = new Map(activeCars);
    
    gameField.scrollTo({
        left: 0,
        behavior: 'auto'
    });
    
    gameField.innerHTML = '';

    const imageRoad = document.createElement('div');
    imageRoad.classList.add('game-road', 'image-road');
    gameField.appendChild(imageRoad);

    const coeffArray = coefficients[currentDifficulty];

    for (let i = 0; i < coeffArray.length; i++) {
        const road = document.createElement('div');
        road.classList.add('game-road');

        const manhole = document.createElement('div');
        manhole.classList.add('manhole');

        const coefficient = coeffArray[i];
        const span = document.createElement('span');
        span.textContent = `${coefficient.toFixed(2)}`;
        manhole.appendChild(span);

        road.appendChild(manhole);
        gameField.appendChild(road);
    }

    const lastRoad = document.createElement('div');
    lastRoad.classList.add('game-road', 'special-road');

    const roadImage = document.createElement('img');
    roadImage.src = 'png/pravo1.png';
    roadImage.classList.add('road-image');
    lastRoad.appendChild(roadImage);

    gameField.appendChild(lastRoad);

    setTimeout(() => {
        createChickenOnStart();
        
        currentActiveCars.forEach((carData, roadIndex) => {
            if (roadIndex < getAllRoads().length && 
                !roadsWithBarrier.has(roadIndex) &&
                !(isLosingGame && roadIndex === losingRoad)) {
                createCarOnRoad(roadIndex);
            }
        });
        
        
        calculateRoadWidth();
        startRandomCarAnimation();
    }, 100);
}

    updateBalanceDisplay();
    document.getElementById('balance').addEventListener('click', editBalance);


    document.querySelector('.difficulty-btn[data-level="easy"]').classList.add('active');
    playButton.addEventListener('click', playButtonHandler);

    minBetButton.addEventListener('click', () => {
        betInput.value = '0.01';
    });

    maxBetButton.addEventListener('click', () => {
        const currentBalance = getBalance();
        betInput.value = Math.min(200, currentBalance).toString();
    });

    fastBetButtons.forEach(button => {
        button.addEventListener('click', function () {
            const betAmount = button.getAttribute('data-bet');
            const currentBalance = getBalance();
            const numericBet = parseFloat(betAmount);
            
            if (numericBet <= currentBalance) {
                betInput.value = betAmount;
            }
        });
    });

    renderRoads();

let isDragging = false;
let startX;
let startScrollLeft;

gameField.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.pageX - gameField.offsetLeft;
    startScrollLeft = gameField.scrollLeft;
    gameField.style.scrollBehavior = 'auto';
});

gameField.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const x = e.pageX - gameField.offsetLeft;
    const walk = (x - startX) * 1;
    gameField.scrollLeft = startScrollLeft - walk;
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        gameField.style.scrollBehavior = 'smooth';
    }
});
    console.log('winPopup element:', winPopup);
    console.log('winAmountText element:', winAmountText);

    if (!winPopup) {
        console.error('Win popup element not found!');
        winPopup = document.getElementById('win-popup');
    }

    if (!winAmountText) {
        console.error('Win amount text element not found!');
        winAmountText = document.getElementById('win-amount-text');
    }
});