export const SLOTS_PER_RACK = 8;
export const RACKS_COUNT = 10;
export const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

export function getGlobalSlotIndex(rackIndex, localSlotIndex) {
    return (rackIndex - 1) * SLOTS_PER_RACK + localSlotIndex;
}

export function getMachineDescriptor(machine) {
    const hashRate = Number(machine?.hashRate || machine?.hash_rate || 0);
    const slotSize = Number.isInteger(machine?.slotSize) ? machine.slotSize : (Number.isInteger(machine?.slot_size) ? machine.slot_size : null);

    if (machine?.image_url) {
        return {
            name: machine?.miner_name || machine?.name || "Miner",
            image: machine.image_url,
            size: slotSize || (hashRate >= 100 ? 2 : 1)
        };
    }

    if (hashRate >= 100) {
        return { name: "Elite Miner", image: "/assets/machines/elite-miner.png", size: slotSize || 2 };
    }

    if (hashRate >= 80) {
        return { name: "Pro Miner", image: "/assets/machines/pro-miner.png", size: slotSize || 1 };
    }

    return { name: "Basic Miner", image: "/assets/machines/basic-miner.png", size: slotSize || 1 };
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
