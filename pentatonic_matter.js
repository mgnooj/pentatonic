// TODO
    // I think the rotation/angle distinction was fucked up in DebugLevelEditor, re-do with 'angle' (now fixed)
    // Narrower triangle

// FINISHERS
    // mobile shift key?
    // Change pointer functions to drag functions
    // Move projectile update() code to collision with bounds
    // Cool title screen with random bouncing ball
    // random button
    // widen to 1200 px

class Pentatonic extends Phaser.Scene {
    emitters = [];
    projectiles = [];
    idNum = 1;
    levelData;
    cursors;
    score = 0;
    bestScore = highScores[this.sys.key].bestScore;
    shiftDown = false;
    uiLayer;
    synthLayer;

    completed = highScores[this.sys.key].completed;

    tempoText;
    scoreText;
    bestScoreText;

    hintAndNextLevelButton;
    hintText = '';

    // Every time we register a collision:
    // collisions[projectile.id].push((collider.id, collider.type))
    collisions = {};
    // Every time a projectile is killed:
    // projectileScores[projectile.id] = getScore(collisions[projectileId])
    // collisions[projectile.id] = []
    projectileScores = {};
    // score = totalScore(projectileScores);
    // bestScore = score > bestScore ? score : bestScore;

    constructor(key) {
        super(key);
    }

    create() {
        this.matter.world.disableGravity();
        this.matter.pause();
        
        // Create all objects + draw menu
        for (const data of this.levelData) { 
            this.drawItem(data);
        }

        const line = this.add.line(0, 0, 0, 800, 1600, 800, 0xffffff, 1.0); // x, y, x1, y1, x2, y2, color
        this.drawUI();

        this.matter.world.on("collisionstart", (event, bodyA, bodyB) => {
            this.triggerNote(bodyA, bodyB);
        });

        this.cursors = this.input.keyboard.createCursorKeys();

        this.matter.resume();
        for (const emitter of this.emitters) {
            this.emitProjectile(emitter);
        }
    }

    update() {
        // Use reverse iteration to safely remove items during loop
        for (let i = this.projectiles.length - 1; i >= 0; i--) {    // TODO Move this to collision function, setWorldBounds
            const projectile = this.projectiles[i];
            // Check bounds
            if (projectile.x < 10 || projectile.x > 790 || projectile.y < 10 || projectile.y > 790) {       // This checks center; we want to destory proj. when it hits the boundary
                const projectileId = projectile.getData('id');
                // Remove from array
                this.projectiles.splice(i, 1);
                // update projectileScores and collisions entry
                this.projectileScore(projectileId);
                this.collisions[projectileId] = [];
                // Destroy the game object
                this.destroy(projectile);
                // Emit new projectile
                for (const emitter of this.emitters) {
                    if (emitter.getData('id') == projectileId) {
                        this.emitProjectile(emitter);
                        break;
                    }
                }
            }
        }
    }

    completed() {
        // Override me! Called at the end of projectileScore()
    }

    projectileScore(id) {
        // collisions = [(id, type), (id, type), (id, type) ........]
        let collisions = this.collisions[id];
        if (!collisions) { return; }
        let ids = {};
        let types = {};

        let baseScore = 100;
        let currentScore = 0;
        for (const collision of collisions) {
            if (ids[collision[0]]) {
                // If we've hit this already, 100 / 2^numCollisions
                baseScore = 100 * Math.pow(0.7, ids[collision[0]]);
                ids[collision[0]] += 1;
            } else {
                // Else score stays the same
                ids[collision[0]] = 1;
            }
            if (types[collision[1]]) {
                // If we've hit this type already, 100 / 1.5^numCollisions, take the min
                baseScore = Math.min(baseScore, 100 * Math.pow(0.9, types[collision[1]]));
                types[collision[1]] += 1;
            } else {
                types[collision[1]] = 1;
            }
            currentScore += baseScore;
            baseScore = 100;
        }
        this.projectileScores[id] = currentScore;
        this.score = Math.round(this.totalScore(this.projectileScores));
        this.bestScore = Math.round(Math.max(this.bestScore, this.score));
        this.scoreText.setText(`${this.score}`);
        this.bestScoreText.setText(`${this.bestScore}`);
        this.completed();
    }
    
    totalScore(projectileScores) {
        // projectileScores = {key: num, key2: num2 .....}
        const sum = Object.values(projectileScores).reduce((accumulator, currentValue) => accumulator + currentValue, 0);
        return sum;
    }

    destroy(gameObject) {
        if (gameObject.body) {
            this.matter.world.remove(gameObject.body);
        }
        if (gameObject.getData('type') == TRIANGLE) {
            const ind = this.emitters.indexOf(gameObject);
            this.emitters.splice(ind, 1);
        }
        gameObject.destroy();
    }

    // Each entity is represented by a JSON object with the following keys:
    // data = {'x', 'y', 'size', 'orientation', 'type'}
    drawItem(data) {
        this.drawPolygon(data['x'], data['y'], data['size'], data['type'], data['orientation'], this.getId());
    }

    getId() {
        const newId = this.idNum;
        this.idNum += 1;
        return newId;
    }

    drawPolygon(x, y, radius, type, rotation, id) {
        const coords = polygonCoordinates[type];

        const polygon = this.add.polygon(x, y, coords, COLORS[type], 0.7);

        this.matter.add.gameObject(polygon, {
            shape: { type: 'fromVerts', verts: coords, flagInternal: true },
            isStatic: true
        });
        polygon.setVelocity(0, 0);
        polygon.setBounce(1.0);
        polygon.setFriction(0, 0, 0);
        polygon.angle = rotation;
        const scale = radius == SMALL ? 0.5 : radius == MEDIUM ? 1.0 : 2.0;
        polygon.setScale(scale, scale);
        
        polygon.setData('type', type);
        polygon.setData('note', type);
        polygon.setData('id', id);
        polygon.setData('size', radius);
        polygon.setData('pitch', radius == 25 ? 4 : radius == 50 ? 3 : 2);

        if (type == TRIANGLE) {
            this.makeDraggable(polygon);
            this.emitters.push(polygon);
            this.collisions[id] = [];
        }
    }

    emitProjectile(emitter) {
        const halfHeight = emitter.height / 2 + 24;
        let localOffset = new Phaser.Math.Vector2(0, -halfHeight);

        // Rotate this offset by emitter's rotation
        Phaser.Math.RotateAround(localOffset, 0, 0, emitter.rotation);
        // World coordinates of the spawn point
        const spawnX = emitter.x + localOffset.x;
        const spawnY = emitter.y + localOffset.y;

        if (spawnX < 30 || spawnX > 770 || spawnY < 30 || spawnY > 770) { return; }

        const projectile = this.add.circle(spawnX, spawnY, 8, 0xffffff);
        const body = this.matter.add.gameObject(projectile, {
            shape: { type: 'circle', radius: 8 }
        });

        const angle = emitter.rotation - Math.PI / 2; // up
        projectile.setVelocity(Math.cos(angle) * velocity, Math.sin(angle) * velocity);
        projectile.setBounce(1.0);
        projectile.setFriction(0, 0, 0);

        projectile.setData('type', PROJECTILE);
        projectile.setData('id', emitter.getData('id'));

        audioEngine.synth.triggerAttackRelease(key[0] + '3', noteLength, '+0.05');
        this.projectiles.push(projectile);
    }

    triggerNote(body1, body2) {
        const colliderA = body1.gameObject.getData('type');
        const colliderB = body2.gameObject.getData('type');
        if (colliderA != PROJECTILE && colliderB != PROJECTILE) { return; }
        if (colliderA == PROJECTILE && colliderA == PROJECTILE) {
            audioEngine.synth.triggerAttackRelease(key[0] + '4', noteLength, '+0.05');
            this.collisions[body1.gameObject.getData("id")].push((colliderB, body2.gameObject.getData('id')));
            this.collisions[body2.gameObject.getData("id")].push((colliderA, body1.gameObject.getData('id')));
        } else if (colliderA == TRIANGLE || colliderB == TRIANGLE) {
            audioEngine.synth.triggerAttackRelease(key[0] + '2', noteLength, '+0.05');
        } else {
            const soundSource = colliderA == PROJECTILE ? body2 : body1;
            const note = soundSource.gameObject.getData('note');
            const pitch = soundSource.gameObject.getData('pitch');
            audioEngine.synth.triggerAttackRelease(key[note] + pitch, noteLength, '+0.05');
            const collider = colliderA == PROJECTILE ? body1 : body2;
            this.collisions[collider.gameObject.getData("id")].push((soundSource.gameObject.getData("type"), soundSource.gameObject.getData('id')));
        }
    }

    drawUI() {
        // Basic: Score; synth controls; major/minor, tempo; start / pause / reset
        const pauseButton = this.add.text(50, 825, 'Pause', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(pauseButton);
        pauseButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.matter.pause() );

        const startButton = this.add.text(118, 825, 'Resume', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(startButton);
        startButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.matter.resume() );

        const resetButton = this.add.text(200, 825, 'Reset', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(resetButton);
        resetButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            // Clear all projectiles + refire
            for (const projectile of this.projectiles) {
                this.destroy(projectile);
            }
            this.projectiles = [];
            for (const emitter of this.emitters) {
                this.emitProjectile(emitter);
            }
        });

        const mainMenuButton = this.add.text(263, 825, 'Quit', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(mainMenuButton);
        mainMenuButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            highScores[this.sys.key] = {bestScore: this.bestScore, completed: this.completed};
            this.scene.start('title');
        });

        const keyLabel = this.add.text(355, 800, 'Key', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const majorMinorButton = this.add.text(350, 825, 'Major', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(majorMinorButton);
        majorMinorButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            if (key === majorKey) {
                key = minorKey;
                majorMinorButton.text = "Minor";
            } else {
                key = majorKey;
                majorMinorButton.text = "Major";
            }
        });

        const tempoLabel = this.add.text(460, 800, 'Velocity', { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        const tempoDownButton = this.add.text(455, 825, '<', { fontFamily: fontFamily,color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(tempoDownButton);
        tempoDownButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            velocity = Math.max(velocity - 1, 0); 
            this.tempoText.setText(`${velocity}`);
        });

        this.tempoText = this.add.text(477, 825, `${velocity}`, { fontFamily: fontFamily,color: 'white', backgroundColor: 'black' });

        const tempoUpButton = this.add.text(505, 825, '>', {fontFamily: fontFamily,color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(tempoUpButton);
        tempoUpButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            velocity = Math.min(velocity + 1, 30); 
            this.tempoText.setText(`${velocity}`);
        });

        const scoreLabel = this.add.text(575, 805, 'Score:', { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        this.scoreText = this.add.text(635, 805, `${this.score}`, { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        const bestScoreLabel = this.add.text(575, 830, 'Best:', { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        this.bestScoreText = this.add.text(635, 830, `${this.bestScore}`, { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });

        const mainUI = this.add.text(700, 800, 'Main', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(mainUI);
        mainUI.on(Phaser.Input.Events.POINTER_DOWN, () => {
            this.uiLayer.forEach(btn => btn.visible = true);
            this.synthLayer.forEach(btn => btn.visible = false);
            this.synthKnobs.forEach(ctrl => ctrl.knob.visible = false);
            this.hintText.visible = false;
            mainUI.setBackgroundColor('red');
            synthControls.setBackgroundColor('white');
            this.hintAndNextLevelButton.setBackgroundColor('white');
        });

        const synthControls = this.add.text(700, 825, 'Synth', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(synthControls);
        synthControls.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            this.uiLayer.forEach(btn => btn.visible = false);
            this.synthLayer.forEach(btn => btn.visible = true);
            this.synthKnobs.forEach(ctrl => ctrl.knob.visible = true);
            this.hintText.visible = false;
            mainUI.setBackgroundColor('white');
            synthControls.setBackgroundColor('red');
            this.hintAndNextLevelButton.setBackgroundColor('white');
        });

        this.hintAndNextLevelButton = this.add.text(700, 850, 'Hint', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(this.hintAndNextLevelButton);
        this.hintAndNextLevelButton.on('pointerdown', () => { 
            this.uiLayer.forEach((x) => x.visible = false);
            this.synthLayer.forEach((x) => x.visible = false);
            this.synthKnobs.forEach((x) => x.knob.visible = false);
            this.hintText.visible = true;
            mainUI.setBackgroundColor('white');
            synthControls.setBackgroundColor('white');
            this.hintAndNextLevelButton.setBackgroundColor('red');
        });

        this.hintText = this.add.text(100, 825, this.hint, { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });

        this.uiLayer = [pauseButton, startButton, resetButton, mainMenuButton, keyLabel, majorMinorButton, tempoLabel, tempoDownButton, this.tempoText, tempoUpButton, scoreLabel, this.scoreText, bestScoreLabel, this.bestScoreText];
        
        // Tone.FMSynth, Tone.Synth, Tone.MonoSynth
        const monosynthButton = this.add.text(100, 800, 'Analog', {fontFamily: fontFamily, color: 'black', backgroundColor: 'red', padding: 2});
        this.makeUITogglePop(monosynthButton);
        monosynthButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            audioEngine.changeSynth(audioEngine.monoSynth);
            monosynthButton.setBackgroundColor('red');
            synthButton.setBackgroundColor('white');
            fmsynthButton.setBackgroundColor('white');
        });
        
        const synthButton = this.add.text(100, 825, 'Digital', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(synthButton);
        synthButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            audioEngine.changeSynth(audioEngine.digitalSynth);
            monosynthButton.setBackgroundColor('white');
            synthButton.setBackgroundColor('red');
            fmsynthButton.setBackgroundColor('white');
        });
        
        const fmsynthButton = this.add.text(100, 850, 'FM', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(fmsynthButton);
        fmsynthButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            audioEngine.changeSynth(audioEngine.fmSynth); 
            monosynthButton.setBackgroundColor('white');
            synthButton.setBackgroundColor('white');
            fmsynthButton.setBackgroundColor('red');
        });

        //vibrato.frequency, depth
        const vibratoLabel = this.add.text(220, 800, 'Vibrato', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const vibratoFreq = new Knob(this, 225, 840, 20, audioEngine.vibrato, 10.0, {frequency: 0});
        const vibratoDepth = new Knob(this, 275, 840, 20, audioEngine.vibrato, 1.0, {depth: 0});
        //chorus.delayTime, depth
        const chorusLabel = this.add.text(395, 800, 'Chorus', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const chorusDelay = new Knob(this, 400, 840, 20, audioEngine.chorus, 5.0, {delayTime: 0});
        const chorusDepth = new Knob(this, 450, 840, 20, audioEngine.chorus, 2.0, {depth: 0});
        //delay.delayTime, feeback
        const delayLabel = this.add.text(575, 800, 'Delay', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const delayTime = new Knob(this, 575, 840, 20, audioEngine.feedbackDelay, 1.0, {delayTime: 0});
        const delayFeedback = new Knob(this, 625, 840, 20, audioEngine.feedbackDelay, 0.8, {feedback: 0});

        this.synthLayer = [monosynthButton, synthButton, fmsynthButton, vibratoLabel, chorusLabel, delayLabel];
        this.synthKnobs = [vibratoFreq, vibratoDepth, chorusDelay, chorusDepth, delayTime, delayFeedback];
        this.synthLayer.forEach(btn => btn.visible = false);
        this.synthKnobs.forEach(ctrl => ctrl.knob.visible = false);
    }

    makeUIElementPop(gameObject) {
        gameObject.setInteractive();
        gameObject.on('pointerover', () => {
            gameObject.setBackgroundColor('gray');
        });
        gameObject.on('pointerdown', () => {
            gameObject.setBackgroundColor('red');
        });
        gameObject.on('pointerup', () => {
            gameObject.setBackgroundColor('gray');
        });
        gameObject.on('pointerout', () => {
            gameObject.setBackgroundColor('white');
        });
    }

    makeUITogglePop(gameObject) {
        gameObject.setInteractive();
        gameObject.on('pointerover', () => {
            gameObject.setColor('gray');
        });
        gameObject.on('pointerout', () => {
            gameObject.setColor('black');
        });
    }

    makeDraggable(gameObject) {
        gameObject.setInteractive();
        let startAngle;

        const onDrag = function (pointer) {
            if (this.cursors.shift.isDown) {
                gameObject.angle = startAngle + (pointer.x - gameObject.x) * 5 % 360; 
            } else {
                gameObject.x = pointer.x;
                gameObject.y = Math.min(pointer.y, 800 - (gameObject.height / 2));
            }
        };

        const stopDrag = () => {
            gameObject.on(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_MOVE, onDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_UP, stopDrag, this);
            gameObject.x = Math.round(gameObject.x);
            gameObject.y = Math.round(gameObject.y);
            gameObject.setSensor(false);
        };

        const startDrag = () => {
            gameObject.off(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
            gameObject.on(Phaser.Input.Events.POINTER_MOVE, onDrag, this);
            gameObject.on(Phaser.Input.Events.POINTER_UP, stopDrag, this);
            gameObject.setSensor(true);
            startAngle = gameObject.angle;
        };

        const destroy = () => {
            gameObject.off(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_MOVE, onDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_UP, stopDrag, this);
        };

        gameObject.on(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
        gameObject.once(Phaser.GameObjects.Events.DESTROY, destroy, this);
    }
}

class LevelEditor extends Pentatonic {
    // Same as Level with extra editor menu
    levelData = [];
    clickedObject;
    shapeMenu;
    shapeEditor;
    // Variables to control flow from shape editor, which is buggy
    activeMenus;
    shapeEditorActive = false;
    // Shape editor UI
    small;
    medium;
    large;
    noteText;

    constructor() {
        super({key: 'editor'});
    }

    drawUI() {
        const pauseButton = this.add.text(50, 825, 'Pause', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(pauseButton);
        pauseButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.matter.pause() );

        const startButton = this.add.text(118, 825, 'Resume', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(startButton);
        startButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.matter.resume() );

        const resetButton = this.add.text(200, 825, 'Reset', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(resetButton);
        resetButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            // Clear all projectiles + refire
            for (const projectile of this.projectiles) {
                this.destroy(projectile);
            }
            this.projectiles = [];
            for (const emitter of this.emitters) {
                this.emitProjectile(emitter);
            }
        });

        const mainMenuButton = this.add.text(263, 825, 'Quit', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(mainMenuButton);
        mainMenuButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            highScores[this.sys.key] = {bestScore: this.bestScore, completed: this.completed};
            this.scene.start('title');
        });

        const keyLabel = this.add.text(355, 800, 'Key', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const majorMinorButton = this.add.text(350, 825, 'Major', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(majorMinorButton);
        majorMinorButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            if (key === majorKey) {
                key = minorKey;
                majorMinorButton.text = "Minor";
            } else {
                key = majorKey;
                majorMinorButton.text = "Major";
            }
        });

        const tempoLabel = this.add.text(460, 800, 'Velocity', { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        const tempoDownButton = this.add.text(455, 825, '<', { fontFamily: fontFamily,color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(tempoDownButton);
        tempoDownButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            velocity = Math.max(velocity - 1, 0); 
            this.tempoText.setText(`${velocity}`);
        });

        this.tempoText = this.add.text(477, 825, `${velocity}`, { fontFamily: fontFamily,color: 'white', backgroundColor: 'black' });

        const tempoUpButton = this.add.text(505, 825, '>', {fontFamily: fontFamily,color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(tempoUpButton);
        tempoUpButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            velocity = Math.min(velocity + 1, 30); 
            this.tempoText.setText(`${velocity}`);
        });

        const scoreLabel = this.add.text(575, 805, 'Score:', { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        this.scoreText = this.add.text(635, 805, `${this.score}`, { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        const bestScoreLabel = this.add.text(575, 830, 'Best:', { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });
        this.bestScoreText = this.add.text(635, 830, `${this.bestScore}`, { fontFamily: fontFamily,color: 'white', backgroundColor: 'black', padding: 2 });

        const mainUI = this.add.text(700, 800, 'Main', {fontFamily: fontFamily, color: 'black', backgroundColor: 'red', padding: 2});
        this.makeUITogglePop(mainUI);
        mainUI.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            this.uiLayer.forEach(btn => btn.visible = true);
            this.synthLayer.forEach(btn => btn.visible = false);
            this.synthKnobs.forEach(ctrl => ctrl.knob.visible = false);
            this.shapeMenu.forEach(btn => btn.visible = false);
            this.shapeEditor.forEach(btn => btn.visible = false);
            this.activeMenus = [this.uiLayer];
            this.shapeEditorActive = false;
            mainUI.setBackgroundColor('red');
            synthControls.setBackgroundColor('white');
            addShapes.setBackgroundColor('white');
        });


        const synthControls = this.add.text(700, 825, 'Synth', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(synthControls);
        synthControls.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            this.uiLayer.forEach(btn => btn.visible = false);
            this.synthLayer.forEach(btn => btn.visible = true);
            this.synthKnobs.forEach(ctrl => ctrl.knob.visible = true);
            this.shapeMenu.forEach(btn => btn.visible = false);
            this.shapeEditor.forEach(btn => btn.visible = false);
            this.activeMenus = [this.synthLayer, this.synthKnobs];
            this.shapeEditorActive = false;
            mainUI.setBackgroundColor('white');
            synthControls.setBackgroundColor('red');
            addShapes.setBackgroundColor('white');
        });

        const addShapes = this.add.text(700, 850, 'Shapes', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(addShapes);
        addShapes.on(Phaser.Input.Events.POINTER_DOWN, () => {
            this.uiLayer.forEach(btn => btn.visible = false);
            this.synthLayer.forEach(btn => btn.visible = false);
            this.synthKnobs.forEach(ctrl => ctrl.knob.visible = false);
            this.shapeMenu.forEach(btn => btn.visible = true);
            this.shapeEditor.forEach(btn => btn.visible = false);
            this.activeMenus = [this.shapeMenu];
            this.shapeEditorActive = false;
            mainUI.setBackgroundColor('white');
            synthControls.setBackgroundColor('white');
            addShapes.setBackgroundColor('red');
        });

        const clearButton = this.add.text(700, 875, 'Clear', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(clearButton);
        clearButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
            for (const x of this.levelData) {
                this.destroy(x);
            }
            this.levelData = [];
            this.emitters = [];
            this.projectiles = [];
            if (this.shapeEditorActive) {
                this.shapeEditorActive = false;
                this.shapeEditor.forEach(btn => btn.visible = false);
                this.returnToActiveMenus();
            }
        });

        this.uiLayer = [pauseButton, startButton, resetButton, mainMenuButton, keyLabel, majorMinorButton, tempoLabel, tempoDownButton, this.tempoText, tempoUpButton, scoreLabel, this.scoreText, bestScoreLabel, this.bestScoreText];

        const monosynthButton = this.add.text(100, 800, 'Analog', {fontFamily: fontFamily, color: 'black', backgroundColor: 'red', padding: 2});
        this.makeUITogglePop(monosynthButton);
        monosynthButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            audioEngine.changeSynth(audioEngine.monoSynth);
            monosynthButton.setBackgroundColor('red');
            synthButton.setBackgroundColor('white');
            fmsynthButton.setBackgroundColor('white');
        });
        
        const synthButton = this.add.text(100, 825, 'Digital', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(synthButton);
        synthButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            audioEngine.changeSynth(audioEngine.digitalSynth);
            monosynthButton.setBackgroundColor('white');
            synthButton.setBackgroundColor('red');
            fmsynthButton.setBackgroundColor('white');
        });
        
        const fmsynthButton = this.add.text(100, 850, 'FM', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(fmsynthButton);
        fmsynthButton.on(Phaser.Input.Events.POINTER_DOWN, () => { 
            audioEngine.changeSynth(audioEngine.fmSynth); 
            monosynthButton.setBackgroundColor('white');
            synthButton.setBackgroundColor('white');
            fmsynthButton.setBackgroundColor('red');
        });

        //vibrato.frequency, depth
        const vibratoLabel = this.add.text(220, 800, 'Vibrato', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const vibratoFreq = new Knob(this, 225, 840, 20, audioEngine.vibrato, 10.0, {frequency: 0});
        const vibratoDepth = new Knob(this, 275, 840, 20, audioEngine.vibrato, 1.0, {depth: 0});
        //chorus.delayTime, depth
        const chorusLabel = this.add.text(395, 800, 'Chorus', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const chorusDelay = new Knob(this, 400, 840, 20, audioEngine.chorus, 5.0, {delayTime: 0});
        const chorusDepth = new Knob(this, 450, 840, 20, audioEngine.chorus, 2.0, {depth: 0});
        //delay.delayTime, feeback
        const delayLabel = this.add.text(575, 800, 'Delay', { fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2 });
        const delayTime = new Knob(this, 575, 840, 20, audioEngine.feedbackDelay, 1.0, {delayTime: 0});
        const delayFeedback = new Knob(this, 625, 840, 20, audioEngine.feedbackDelay, 0.8, {feedback: 0});

        this.synthLayer = [monosynthButton, synthButton, fmsynthButton, vibratoLabel, chorusLabel, delayLabel];
        this.synthKnobs = [vibratoFreq, vibratoDepth, chorusDelay, chorusDepth, delayTime, delayFeedback];
        this.synthLayer.forEach(btn => btn.visible = false);
        this.synthKnobs.forEach(ctrl => ctrl.knob.visible = false);


        // Editor: Shapes (drag and drop); shape size + delete (on click)
        const emitter = this.drawPolygon(150, 870, MEDIUM, TRIANGLE, 0, this.getId());
        this.makeDraggable(emitter);
        const square = this.drawPolygon(250, 860, MEDIUM, SQUARE, 0, this.getId());
        this.makeDraggable(square);
        const pentagon = this.drawPolygon(350, 860, MEDIUM, PENTAGON, 0, this.getId());
        this.makeDraggable(pentagon);
        const hexagon = this.drawPolygon(450, 860, MEDIUM, HEXAGON, 0, this.getId());
        this.makeDraggable(hexagon);
        const octagon = this.drawPolygon(550, 860, MEDIUM, OCTAGON, 0, this.getId());
        this.makeDraggable(octagon);

        this.shapeMenu = [emitter, square, pentagon, hexagon, octagon];
        this.shapeMenu.forEach((x) => x.visible = false);

        const editorLabel = this.add.text(215, 800, 'Size', {fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2});
        this.small = this.add.text(100, 825, 'Small', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(this.small);
        this.small.on('pointerdown', () => {
            this.clickedObject.setScale(0.5, 0.5);
            this.clickedObject.setData('size', SMALL);
            this.clickedObject.setData('pitch', 4);
            this.noteText.setText(key[this.clickedObject.getData('note')] + '4');
            this.small.setBackgroundColor('red');
            this.medium.setBackgroundColor('white');
            this.large.setBackgroundColor('white');
        });
        this.medium = this.add.text(200, 825, 'Medium', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(this.medium);
        this.medium.on('pointerdown', () => {
            this.clickedObject.setScale(1.0, 1.0);
            this.clickedObject.setData('size', MEDIUM);
            this.clickedObject.setData('pitch', 3);
            this.noteText.setText(key[this.clickedObject.getData('note')] + '3');
            this.small.setBackgroundColor('white');
            this.medium.setBackgroundColor('red');
            this.large.setBackgroundColor('white');
        });
        this.large = this.add.text(300, 825, 'Large', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUITogglePop(this.large);
        this.large.on('pointerdown', () => {
            this.clickedObject.setScale(2.0, 2.0);
            this.clickedObject.setData('size', LARGE);
            this.clickedObject.setData('pitch', 2);
            this.noteText.setText(key[this.clickedObject.getData('note')] + '2');
            this.small.setBackgroundColor('white');
            this.medium.setBackgroundColor('white');
            this.large.setBackgroundColor('red');
        });
        const deleteShapeButton = this.add.text(400, 825, 'Delete', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(deleteShapeButton);
        deleteShapeButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
                this.destroy(this.clickedObject);
                this.shapeEditor.forEach((x) => x.visible = false);
                this.returnToActiveMenus();
        });
        const noteLabel = this.add.text(545, 800, 'Note', {fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2});
        this.noteText = this.add.text(550, 825, '', {fontFamily: fontFamily, color: 'white', backgroundColor: 'black', padding: 2});

        this.shapeEditor = [this.small, this.medium, this.large, deleteShapeButton, editorLabel, noteLabel, this.noteText];
        this.shapeEditor.forEach((x) => x.visible = false);
    }

    returnToActiveMenus() {
        this.activeMenus[0].forEach((x) => x.visible = true);
        if (this.activeMenus.length == 2) {
            this.activeMenus[1].forEach((x) => x.knob.visible = true);
        }
    }

    makeDraggable(gameObject) {
        gameObject.setInteractive();
        let cloneData = false;
        let startAngle;

        const onDrag = function (pointer) {
            if (this.cursors.shift.isDown) {
                gameObject.angle = startAngle + (pointer.x - gameObject.x) * 5 % 360; 
            } else {
                gameObject.x = pointer.x;
                gameObject.y = pointer.y;
            }
        };

        const stopDrag = () => {
            gameObject.on(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_MOVE, onDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_UP, stopDrag, this);
            gameObject.x = Math.round(gameObject.x);
            gameObject.y = Math.round(gameObject.y);
            if (gameObject.y + (gameObject.height / 2) > 800) {
                const ind = this.levelData.indexOf(gameObject);
                this.levelData.splice(ind, 1);
                this.destroy(gameObject);
                if (this.shapeEditorActive) {
                    this.shapeEditorActive = false;
                    this.shapeEditor.forEach(btn => btn.visible = false);
                    this.returnToActiveMenus();
                }
            }
            if (cloneData) {
                if (gameObject.getData('type') == TRIANGLE) {
                    this.emitters.push(gameObject);
                    this.collisions[gameObject.getData('id')] = [];
                    this.emitProjectile(gameObject);
                }
                const newPoly = this.drawPolygon(cloneData.x, cloneData.y, cloneData.size, cloneData.type, 0, this.getId());
                this.makeDraggable(newPoly);
                this.shapeMenu.splice(this.shapeMenu.indexOf(gameObject), 1);
                this.levelData.push(gameObject);
                this.shapeMenu.push(newPoly);
                cloneData = false;
            }
        };

        const startDrag = () => {
            gameObject.off(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
            gameObject.on(Phaser.Input.Events.POINTER_MOVE, onDrag, this);
            gameObject.on(Phaser.Input.Events.POINTER_UP, stopDrag, this);
            if (gameObject.y > 800) {
                cloneData = {x: gameObject.x, y: gameObject.y, size: gameObject.getData('size'), type: gameObject.getData('type')}
            } else if (gameObject.getData('type') != TRIANGLE) {
                this.clickedObject = gameObject;
                const objectSize = gameObject.getData('size');
                if (objectSize == 25) {
                    this.small.setBackgroundColor('red');
                    this.medium.setBackgroundColor('white');
                    this.large.setBackgroundColor('white');
                } else if (objectSize == 50) {
                    this.small.setBackgroundColor('white');
                    this.medium.setBackgroundColor('red');
                    this.large.setBackgroundColor('white');
                } else {
                    this.small.setBackgroundColor('white');
                    this.medium.setBackgroundColor('white');
                    this.large.setBackgroundColor('red');
                }
                this.noteText.setText(key[gameObject.getData('note')] + gameObject.getData('pitch'));
                this.uiLayer.forEach(btn => btn.visible = false);
                this.synthLayer.forEach(btn => btn.visible = false);
                this.synthKnobs.forEach(ctrl => ctrl.knob.visible = false);
                this.shapeMenu.forEach(btn => btn.visible = false);
                this.shapeEditor.forEach(btn => btn.visible = true);
                this.shapeEditorActive = true;
            } else {
                this.shapeEditorActive = false;
                this.shapeEditor.forEach(btn => btn.visible = false);
                this.returnToActiveMenus();
            }
            startAngle = gameObject.angle;
        };

        const destroy = () => {
            gameObject.off(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_MOVE, onDrag, this);
            gameObject.off(Phaser.Input.Events.POINTER_UP, stopDrag, this);
        };

        gameObject.on(Phaser.Input.Events.POINTER_DOWN, startDrag, this);
        gameObject.once(Phaser.GameObjects.Events.DESTROY, destroy, this);
    }

    drawPolygon(x, y, radius, type, rotation, id) {
        const coords = polygonCoordinates[type];
        const polygon = this.add.polygon(x, y, coords, COLORS[type], 0.7);

        this.matter.add.gameObject(polygon, {
            shape: { type: 'fromVerts', verts: coords, flagInternal: true },
            isStatic: true
        });
        polygon.setVelocity(0, 0);
        polygon.setBounce(1.0);
        polygon.setFriction(0, 0, 0);
        polygon.angle = rotation;
        
        polygon.setData('type', type);
        polygon.setData('note', type);
        polygon.setData('id', id);
        polygon.setData('size', radius);
        polygon.setData('pitch', radius == 25 ? 2 : radius == 50 ? 3 : 4);

        return polygon;
    }
}

class DebugLevelEditor extends LevelEditor {
    constructor() {
        super({key: 'editor'});
    }

    create() {
        super.create();
        // Add saveLevelButton
        const downloadButton = this.add.text(395, 50, 'Save', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(downloadButton);
        downloadButton.on('pointerdown', () => this.saveLevel());
    }
    
    saveLevel() {
        console.log("LEVEL DATA");
        console.log("\n\n=====================\n\n");
        this.levelData.forEach((x) => {
            try {
                console.log(`{'type': ${x.getData('type')}, 'x': ${x.x}, 'y': ${x.y}, 'size': ${x.getData('size')}, 'orientation': ${x.angle}}`)
            } catch (err) {
                console.log("Problem reading object from gameData");
            }
        });
    }
}

class Level0 extends Pentatonic {   // Intro
    levelData = [
        {'type': 4, 'x': 654, 'y': 617, 'size': 50, 'orientation': 0},
        {'type': 0, 'x': 134, 'y': 632, 'size': 50, 'orientation': 0},
        {'type': 1, 'x': 259, 'y': 614, 'size': 50, 'orientation': 0},
        {'type': 2, 'x': 393, 'y': 619, 'size': 50, 'orientation': 0},
        {'type': 3, 'x': 525, 'y': 615, 'size': 50, 'orientation': 0},
        {'type': 0, 'x': 400, 'y': 167, 'size': 50, 'orientation': -3.141592653589793}
    ];

    constructor() {
        super({key: 'level0'});
    }

    create() {
        super.create();
        // TODO Write intro text
        this.hintAndNextLevelButton.on('pointerdown', () => { 
            highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
            this.scene.start('level1'); 
        })
        this.hintAndNextLevelButton.setText("Next");
    }
}

class Level1 extends Pentatonic {   // High score one emitter
    pointTarget = 250;
    hint = `Score ${this.pointTarget} points`;
    levelData = [
        {'type': 0, 'x': 100, 'y': 332, 'size': 50, 'orientation': 1.0908307824964556},
        {'type': 4, 'x': 469, 'y': 353, 'size': 25, 'orientation': 0.7853981633974492},
        {'type': 3, 'x': 442, 'y': 464, 'size': 25, 'orientation': -0.5672320068981573},
        {'type': 1, 'x': 397, 'y': 398, 'size': 25, 'orientation': -1.745329251994331},
        {'type': 2, 'x': 335, 'y': 356, 'size': 25, 'orientation': 0.5672320068981573},
        {'type': 2, 'x': 566, 'y': 50, 'size': 50, 'orientation': -0.26179938779914913},
        {'type': 3, 'x': 728, 'y': 259, 'size': 50, 'orientation': 0},
        {'type': 4, 'x': 57, 'y': 533, 'size': 50, 'orientation': 0.6544984694978737},
        {'type': 1, 'x': 719, 'y': 73, 'size': 100, 'orientation': -0.08726646259971638},
        {'type': 2, 'x': 94, 'y': 688, 'size': 100, 'orientation': 0.3490658503988655},
        {'type': 3, 'x': 81, 'y': 82, 'size': 100, 'orientation': 0},
        {'type': 4, 'x': 745, 'y': 674, 'size': 50, 'orientation': 0},
        {'type': 1, 'x': 677, 'y': 744, 'size': 25, 'orientation': 0}
    ]

    constructor() {
        super({key: 'level1'});
    }

    completed() {
        if (this.bestScore >= this.pointTarget || this.completed) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('level2'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class Level2 extends Pentatonic {   // High score three emitters
    pointTarget = 750;
    hint = `Score ${this.pointTarget} points`;
    levelData = [
        {'type': 0, 'x': 337, 'y': 423, 'size': 50, 'orientation': -2.094395102393195},
        {'type': 0, 'x': 437, 'y': 423, 'size': 50, 'orientation': 2.094395102393195},
        {'type': 0, 'x': 388, 'y': 337, 'size': 50, 'orientation': 0},
        {'type': 2, 'x': 24, 'y': 640, 'size': 50, 'orientation': 0},
        {'type': 4, 'x': 173, 'y': 742, 'size': 50, 'orientation': 0},
        {'type': 1, 'x': 65, 'y': 740, 'size': 50, 'orientation': 0},
        {'type': 3, 'x': 652, 'y': 63, 'size': 25, 'orientation': 0},
        {'type': 4, 'x': 756, 'y': 131, 'size': 25, 'orientation': 0},
        {'type': 1, 'x': 704, 'y': 25, 'size': 25, 'orientation': 0},
        {'type': 2, 'x': 538, 'y': 53, 'size': 50, 'orientation': 0.8726646259971638},
        {'type': 3, 'x': 758, 'y': 69, 'size': 25, 'orientation': 0},
        {'type': 2, 'x': 109, 'y': 111, 'size': 100, 'orientation': 0},
        {'type': 1, 'x': 38, 'y': 240, 'size': 25, 'orientation': 0},
        {'type': 3, 'x': 263, 'y': 125, 'size': 25, 'orientation': 0},
        {'type': 2, 'x': 243, 'y': 42, 'size': 25, 'orientation': 0},
        {'type': 4, 'x': 84, 'y': 299, 'size': 25, 'orientation': 0},
        {'type': 3, 'x': 33, 'y': 354, 'size': 25, 'orientation': 0},
        {'type': 3, 'x': 718, 'y': 674, 'size': 100, 'orientation': 0},
        {'type': 4, 'x': 739, 'y': 536, 'size': 25, 'orientation': 0},
        {'type': 2, 'x': 574, 'y': 729, 'size': 25, 'orientation': 0}
    ]

    constructor() {
        super({key: 'level2'});
    }
    
    completed() {
        if (this.bestScore >= this.pointTarget || this.completed) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('level3'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class Level3 extends Pentatonic {   // High score three emitters ricochet
    pointTarget = 1000;
    hint = `Score ${this.pointTarget} points after projectile ricochet`;
    levelData = [
        {'type': 2, 'x': 416, 'y': 43, 'size': 50, 'orientation': 0},
        {'type': 1, 'x': 207, 'y': 69, 'size': 50, 'orientation': 0.4363323129985819},
        {'type': 2, 'x': 748, 'y': 163, 'size': 50, 'orientation': -0.4363323129985819},
        {'type': 3, 'x': 602, 'y': 60, 'size': 50, 'orientation': 0},
        {'type': 4, 'x': 62, 'y': 171, 'size': 50, 'orientation': 0},
        {'type': 1, 'x': 511, 'y': 35, 'size': 25, 'orientation': 0.7853981633974492},
        {'type': 4, 'x': 704, 'y': 65, 'size': 25, 'orientation': 0},
        {'type': 4, 'x': 302, 'y': 40, 'size': 25, 'orientation': 0},
        {'type': 4, 'x': 768, 'y': 532, 'size': 100, 'orientation': 0},
        {'type': 3, 'x': 405, 'y': 717, 'size': 50, 'orientation': -0.5235987755982983},
        {'type': 2, 'x': 677, 'y': 707, 'size': 50, 'orientation': 0},
        {'type': 1, 'x': 650, 'y': 613, 'size': 25, 'orientation': 0.17453292519943275},
        {'type': 2, 'x': 254, 'y': 744, 'size': 25, 'orientation': 0},
        {'type': 3, 'x': 58, 'y': 525, 'size': 100, 'orientation': 0},
        {'type': 1, 'x': 89, 'y': 681, 'size': 25, 'orientation': 0},
        {'type': 4, 'x': 572, 'y': 743, 'size': 25, 'orientation': 0},
        {'type': 4, 'x': 167, 'y': 701, 'size': 50, 'orientation': 0},
        {'type': 0, 'x': 384, 'y': 350, 'size': 50, 'orientation': -1.5707963267948966},
        {'type': 0, 'x': 453, 'y': 351, 'size': 50, 'orientation': 1.5707963267948966}
    ]
    constructor() {
        super({key: 'level3'});
    }
    
    projectileScore(id) {
        let collisions = this.collisions[id];
        if (!collisions) { return; }
        const ids = {};
        const types = {};

        let baseScore = 100;
        let currentScore = 0;
        let foundRicochet = false;
        for (const collision of collisions) {
            // if ricochet, foundRicochet = true
            foundRicochet = foundRicochet ? true : collision[1] == PROJECTILE;
            if (!foundRicochet) { continue; }
            if (ids[collision[0]]) {
                // If we've hit this already, 100 / 2^numCollisions
                baseScore = 100 * Math.pow(0.7, ids[collision[0]]);
                ids[collision[0]] += 1;
            } else {
                // Else score stays the same
                ids[collision[0]] = 1;
            }
            if (types[collision[1]]) {
                // If we've hit this type already, 100 / 1.5^numCollisions, take the min
                baseScore = Math.min(baseScore, 100 * Math.pow(0.9, types[collision[1]]));
                types[collision[1]] += 1;
            } else {
                types[collision[1]] = 1;
            }
            currentScore += baseScore;
            baseScore = 100;
        }
        this.projectileScores[id] = currentScore;
        this.score = this.totalScore(this.projectileScores);
        this.bestScore = Math.max(this.bestScore, this.score);
        this.scoreText.setText(`${this.score}`);
        this.bestScoreText.setText(`${this.bestScore}`);
        this.completed();
    }

    completed() {
        if (this.bestScore >= this.pointTarget || this.completed) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('level8'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class Level4 extends Pentatonic {   // High score only emitters + ricochet
    pointTarget = 500;
    hint = `Score ${this.pointTarget} points only using emitters + ricochet; other notes cancel projectile score`;
    constructor() {
        super({key: 'level4'});
    }
    
    projectileScore(id) {
        let collisions = this.collisions[id];
        if (!collisions) { return; }
        const ids = {};
        const types = {};

        let baseScore = 100;
        let currentScore = 0;
        for (const collision of collisions) {
            // if note, score = 0 + break
            if (collision[1] != PROJECTILE && collision[1] != TRIANGLE) { 
                currentScore = 0;
                break; 
            }
            if (ids[collision[0]]) {
                // If we've hit this already, 100 / 2^numCollisions
                baseScore = 100 * Math.pow(0.7, ids[collision[0]]);
                ids[collision[0]] += 1;
            } else {
                // Else score stays the same
                ids[collision[0]] = 1;
            }
            if (types[collision[1]]) {
                // If we've hit this type already, 100 / 1.5^numCollisions, take the min
                baseScore = Math.min(baseScore, 100 * Math.pow(0.9, types[collision[1]]));
                types[collision[1]] += 1;
            } else {
                types[collision[1]] = 1;
            }
            currentScore += baseScore;
            baseScore = 100;
        }
        this.projectileScores[id] = currentScore;
        this.score = this.totalScore(this.projectileScores);
        this.bestScore = Math.max(this.bestScore, this.score);
        this.scoreText.setText(`${this.score}`);
        this.bestScoreText.setText(`${this.bestScore}`);
        this.completed();
    }

    completed() {
        if (this.bestScore >= this.pointTarget || this.completed) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('complete'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class TitleScreen extends Phaser.Scene {

    constructor() {
        super({key: 'title'});
    }

    create() {
        this.add.text(350, 400, 'PENTATONIC', { fontSize: '32px', fontFamily: fontFamily, color: 'white' });
        const startGameButton = this.add.text(375, 450, 'Start', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(startGameButton);
        startGameButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start('level0') );
        const levelEditorButton = this.add.text(375, 475, 'Create', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(levelEditorButton);
        levelEditorButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start('editor') );
        const levelSelectButton = this.add.text(375, 500, 'Select Level', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(levelSelectButton);
        levelSelectButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start('levelselect') );
    }

    makeUIElementPop(gameObject) {
        gameObject.setInteractive();
        gameObject.on('pointerover', () => {
            gameObject.setBackgroundColor('gray');
        });
        gameObject.on('pointerdown', () => {
            gameObject.setBackgroundColor('red');
        });
        gameObject.on('pointerup', () => {
            gameObject.setBackgroundColor('gray');
        });
        gameObject.on('pointerout', () => {
            gameObject.setBackgroundColor('white');
        });
    }
}

class LevelSelect extends Phaser.Scene {
    constructor() {
        super({key: 'levelselect'});
    }
    create() {
    }
}

class Complete extends Phaser.Scene {
    constructor() {
        super({key: 'complete'});
    }
    create() {
        this.backgroundTile = this.add.tileSprite(0, 0, 800, 900, 'background').setOrigin(0, 0);
        this.add.text(350, 400, 'Congratulations. You have mastered the art of the pentatonic scale', { fontSize: '32px', fontFamily: fontFamily, color: 'white' });
        // Calculate total score
        const menuButton = this.add.text(375, 500, 'Return to menu', {fontFamily: fontFamily, color: 'black', backgroundColor: 'white', padding: 2});
        this.makeUIElementPop(menuButton);
        menuButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start('title') );
    }
}

class Instrument {
    constructor() {
        this.monoSynth = new Tone.PolySynth(Tone.MonoSynth, {maxPolyphony: 16});
        this.digitalSynth = new Tone.PolySynth(Tone.Synth, {maxPolyphony: 16});
        this.fmSynth = new Tone.PolySynth(Tone.FMSynth, {maxPolyphony: 16});
        this.synth = this.monoSynth;
        this.vibrato = new Tone.Vibrato(0.0, 0.0);
        this.chorus = new Tone.Chorus(0, 0, 0.0);
        this.feedbackDelay = new Tone.FeedbackDelay(0.0, 0.0);

        // Build the chain
        this.synth.connect(this.vibrato);
        this.vibrato.connect(this.chorus);
        this.chorus.connect(this.feedbackDelay);

        // Delay output to main out
        this.feedbackDelay.toDestination();
    }
    changeSynth(newSynth) {
        if (newSynth == this.synth) { return; }
        this.synth.disconnect(this.vibrato);
        this.synth = newSynth;
        this.synth.connect(this.vibrato);
    }
}

class Knob {
  constructor(scene, x, y, radius, device, maxValue, settings) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.currentValue = 0.0;
    this.knob = null;
    this.device = device;
    this.max = maxValue;
    this.settings = settings;
    this.create();
  }

  create() {
    // Create the knob graphics
    this.knob = this.drawKnob(this.x, this.y, this.radius).setInteractive();

    // Add input events
    this.knob.on('pointerdown', this.startDrag, this);
    this.knob.on('pointerup', this.endDrag, this);
    this.knob.on('pointermove', this.onDrag, this);

    // Initialize drag state
    this.isDragging = false;
    this.startAngle = 0;
  }

  startDrag(pointer) {
    this.startAngle = (this.knob.angle + 360) % 360;
    this.pointerStartLocation = pointer.x;
    this.isDragging = true;
  }

  endDrag() {
    this.isDragging = false;
  }

  onDrag(pointer) {
    if (this.isDragging) {
        const movement = this.startAngle + (pointer.x - this.pointerStartLocation) * 8;
        const normalizedMovement = Math.max(Math.min(movement, 180), 0);
        this.knob.angle = normalizedMovement;
        this.currentValue = normalizedMovement / 180;
        console.log(this.knob.angle);
        let key = Object.keys(this.settings)[0];
        this.settings[key] = this.currentValue * this.max;
        this.device.set(this.settings);
    }
  }

    drawKnob(x, y, radius) {
        const container = this.scene.add.container(x, y);
        const shapeGraphics = this.scene.add.graphics();

        shapeGraphics.fillStyle(0xffffff, 0.7);
        shapeGraphics.fillCircle(0, 0, radius);
        shapeGraphics.strokeCircle(0, 0, radius);

        shapeGraphics.lineStyle(4, 0x000000);
        shapeGraphics.beginPath();
        shapeGraphics.moveTo(0, 0);
        shapeGraphics.lineTo(-radius, 0);
        shapeGraphics.strokePath();

        container.add(shapeGraphics);
        container.setSize(radius * 2, radius * 2);
        container.setInteractive();
        container.on('pointerover', () => {
            container.setScale(1.2);
        });

        container.on('pointerout', () => {
            container.setScale(1.0);
        });

        return container;
    }
}

// GAME CONSTANTS
const notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const range = [2, 3, 4];
const major = [0, 2, 4, 7, 9, 12];
const minor = [0, 3, 5, 7, 10, 12];
function loopThrough(arr, startInd, interval) {
    return (startInd + interval < arr.length) ? arr[startInd + interval] : arr[startInd + interval - arr.length];
}
function makeTuning(root, key) {
    return key.map((interval) => loopThrough(notes, notes.indexOf(root), interval));
}
let audioEngine = new Instrument();
Tone.context.latencyHint = 'playback';
const majorKey = makeTuning('A', major);
const minorKey = makeTuning('A', minor);
const SMALL = 25;
const MEDIUM = 50;
const LARGE = 100;
const COLORS = [
    '0xFFBF00',
    '0x800080',
    '0x00FFFF',
    '0xFF1493',
    '0x00BFFF',
    '0x39FF14'
];
const TRIANGLE = 0;
const SQUARE = 1;
const PENTAGON = 2;
const HEXAGON = 3;
const OCTAGON = 4;
const PROJECTILE = 5;
const polygonCoordinates = [
    '50 0 100 87 0 87',
    '50 0 100 50 50 100 0 50',
    '50 0 100 36 81 95 19 95 0 36',
    '43 0 87 25 87 75 43 100 0 75 0 25',
    '50 0 85 15 100 50 85 85 50 100 15 85 0 50 15 15'
]
const sides = [3, 4, 5, 6, 8];
function getPolygonColor(type) {
    return COLORS[type];
}
function getPolygonSides(type) {
    return sides[type];
}
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
}
function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const val of a) {
        if (!b.has(val)) return false;
    }
    return true;
}
const fontFamily = 'Helvetica, sans-serif';
let key = majorKey;
let velocity = 10;
let noteLength = 0.1;
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 900,
    scene: [TitleScreen, Level0, Level1, Level2, Level3, Level4, Level5, Level6, Level7, Level8, LevelEditor, LevelSelect, Complete],
    physics: {
        default: 'matter',
        matter: {
            timestep: 1000 / 24,
            maxSubSteps: 1,
            positionIterations: 6,
            velocityIterations: 4,
        }
    }
};
const game = new Phaser.Game(config);

let highScores = {
    // level : {bestScore: 0, completed: false}
    level0: {bestScore: 0, completed: true},
    level1: {bestScore: 0, completed: false},
    level2: {bestScore: 0, completed: false},
    level3: {bestScore: 0, completed: false},
    level4: {bestScore: 0, completed: false},
    level5: {bestScore: 0, completed: false},
    level6: {bestScore: 0, completed: false},
    level7: {bestScore: 0, completed: false},
    level8: {bestScore: 0, completed: false},
    editor: {bestScore: 0, completed: false}
}

// TODO These utilize the Level Editor: Replace 'Clear' with 'Hint/Next', test!
class Level5 extends LevelEditor {   // Each once
    hint = `Play each note once`;

    constructor() {
        super({key: 'level5'});
    }

    completed() {
        // Set of all collision ids == set of all gameobject ids
        let allCollisions = Object.values(this.collisions);
        let collisionIds = Set();
        for (const projectileCollisions in allCollisions) {
            projectileCollisions.forEach((x) => collisionIds.add(x[0]));
        }
        let allGameObjectIds = Set(this.levelData.map((x) => x.id));
        let touchedAllOnce = setsEqual(collisionIds, allGameObjectIds);
        if (touchedAllOnce) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('level6'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class Level6 extends LevelEditor {   // Order ascending
    hint = `Play each note element in ascending order (any pitch)`;

    constructor() {
        super({key: 'level6'});
    }

    completed() {
        // list of all collision types == list of all gameobject types sorted by size ascending
        let allCollisions = Object.values(this.collisions);
        let collisionTypes = []
        for (const projectileCollisions in allCollisions) {
            projectileCollisions.forEach((x) => collisionTypes.push(x[1]));
        }
        let orderedAscending = arraysEqual(collisionTypes, [0, 1, 2, 3, 4]);
        if (orderedAscending) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('level7'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class Level7 extends LevelEditor {   // Order descending
    hint = `Play each note element in descending order (any pitch)`;

    constructor() {
        super({key: 'level7'});
    }

    completed() {
        // list of all collision types == list of all gameobject types sorted by size ascending
        let allCollisions = Object.values(this.collisions);
        let collisionTypes = []
        for (const projectileCollisions in allCollisions) {
            projectileCollisions.forEach((x) => collisionTypes.push(x[1]));
        }
        let orderedDescending = arraysEqual(collisionTypes, [4, 3, 2, 1, 0]);
        if (orderedDescending) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('level8'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}

class Level8 extends Pentatonic {   // Play Blowing in the Wind
    hint = `Play this melody. (Q: How many modes must a man walk down?)`;
    // TODO show polygons
    constructor() {
        super({key: 'level8'});
    }

    completed() {
        // list of all collision types == list of all gameobject types sorted by size ascending
        let allCollisions = Object.values(this.collisions);
        let collisionTypes = []
        for (const projectileCollisions in allCollisions) {
            projectileCollisions.forEach((x) => collisionTypes.push(x[1]));
        }
        let playedMelody = arraysEqual(collisionTypes, [3, 3, 3, 4, 4, 4, 3, 2, 1, 0]);
        if (playedMelody) {
            this.hintAndNextLevelButton.on('pointerdown', () => { 
                highScores[this.sys.key] = {bestScore: this.bestScore, completed: true};
                this.scene.start('complete'); 
            })
            this.hintAndNextLevelButton.setText("Next");
        }
    }
}
