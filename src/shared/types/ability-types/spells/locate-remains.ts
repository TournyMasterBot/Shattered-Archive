import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class LocateRemains implements IAbility {
    private static instance: LocateRemains;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Locate Remains";
        this.helpFile = `
LOCATE REMAINS

Syntax: cast 'locate remains' <name>

This low level Necromancy spell is surprisingly useful. A successful
casting of 'locate remains' will indicate where the corpse of a recently
deceased individual can be found. Whether this is on another creature, or
merely laying on the ground, the 'locate remains' spell pinpoints the
location of the victim's corpse.

This spell, used in conjunction with 'embalm' can provide the Necromancer
with a fresh, consistent supply of material for his Art.

See also - NECROMANCY NECROMANCER
        `;
        this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
        this.abilityUsage = AbilityUsage.Active;

        if (LocateRemains.instance === undefined) {
            LocateRemains.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): LocateRemains {
        if (!LocateRemains.instance) {
            LocateRemains.instance = new LocateRemains();
        }
        return LocateRemains.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return LocateRemains.GetInstance() as T;
    }
}

export default LocateRemains;