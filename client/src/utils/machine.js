export const SLOTS_PER_RACK = 8;
export const RACKS_COUNT = 10;
export const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

export function getGlobalSlotIndex(rackIndex, localSlotIndex) {
    return (rackIndex - 1) * SLOTS_PER_RACK + localSlotIndex;
}

export function formatHashrate(value) {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue) || safeValue === 0) return "0 H/s";

    const SCI_UNITS = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s", "YH/s"];
    let scaled = Math.abs(safeValue);
    let tier = 0;

    while (scaled >= 1000) {
        scaled /= 1000;
        tier += 1;
    }

    const sign = safeValue < 0 ? "-" : "";
    const unit = tier < SCI_UNITS.length ? SCI_UNITS[tier] : `${toAlphabeticSuffix(tier - SCI_UNITS.length)}H/s`;
    const precision = scaled >= 100 ? 0 : (scaled >= 10 ? 1 : 2);
    return `${sign}${scaled.toFixed(precision)} ${unit}`;
}

function toAlphabeticSuffix(index) {
    // 0 -> a, 1 -> b, ... 25 -> z, 26 -> aa, ... keeps growing indefinitely.
    let n = Math.max(0, Number(index) || 0);
    let out = "";
    do {
        out = String.fromCharCode(97 + (n % 26)) + out;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
}

export function getMachineDescriptor(machine) {
    const hashRate = Number(machine?.hashRate || machine?.hash_rate || 0);
    const slotSize = Number.isInteger(machine?.slotSize) ? machine.slotSize : (Number.isInteger(machine?.slot_size) ? machine.slot_size : null);

    // Default name mapping based on hash rate
    let defaultName = "Basic Miner";
    let image = "/machines/1.png";
    let size = slotSize || 1;

    if (hashRate >= 1000) {
        defaultName = "Quantum Miner";
        image = "/machines/reward3.png";
        size = slotSize || 2;
    } else if (hashRate >= 500) {
        defaultName = "Elite Miner";
        image = "/machines/reward2.png";
        size = slotSize || 2;
    } else if (hashRate >= 100) {
        defaultName = "Pro Miner";
        image = "/machines/reward1.png";
        size = slotSize || 2;
    } else if (hashRate >= 50) {
        defaultName = "Advanced Miner";
        image = "/machines/3.png";
        size = slotSize || 1;
    } else if (hashRate >= 10) {
        defaultName = "Standard Miner";
        image = "/machines/2.png";
        size = slotSize || 1;
    }

    // Use machine's own name and image if they exist, otherwise fallback to defaults
    return {
        name: machine?.minerName || machine?.miner_name || machine?.name || defaultName,
        image: machine?.imageUrl || machine?.image_url || image,
        size: size
    };
}

export function getMachineBySlot(slotIndex, machines) {
    // Check if this slot is the start of a machine
    const machine = machines.find((m) => m.slotIndex === slotIndex || m.slot_index === slotIndex);
    if (machine) {
        return machine;
    }

    // Check if this slot is occupied by a 2-cell machine from the previous slot
    const previousMachine = machines.find((m) => {
        const pSlot = m.slotIndex !== undefined ? m.slotIndex : m.slot_index;
        if (pSlot !== slotIndex - 1) return false;

        const descriptor = getMachineDescriptor(m);
        return descriptor.size === 2;
    });

    if (previousMachine) {
        return { ...previousMachine, isSecondSlot: true };
    }

    return null;
}
