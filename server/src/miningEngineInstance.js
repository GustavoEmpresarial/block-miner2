let engineInstance = null;

export function setMiningEngine(engine) {
    engineInstance = engine;
}

export function getMiningEngine() {
    return engineInstance;
}
