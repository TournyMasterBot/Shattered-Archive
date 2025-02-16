import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Empath implements IAbility {
    private static instance: Empath;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Empath";
        this.helpFile = `
'EMPATH' 'EMPATHIC WOUND TRANSFER'
EMPATH 'EMPATHIC WOUND TRANSFER'

Syntax: c 'empath' <target>

The Empathic Wound Transfer spell, or 'empath,' as the Necromancers have
dubbed it, is the closest that mages come to being able to heal. The Empath
spell removes damage taken by a target creature, and transfers it to the
Necromancer.  

This is a dangerous practice, as the Necromancer can't control exactly how
much damage he takes on, and a few careless spellcasters have wound up dead
from overcasting this spell.  

See also - NECROMANCY NECROMANCER 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Empath.instance === undefined) {
            Empath.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Empath {
        if (!Empath.instance) {
            Empath.instance = new Empath();
        }
        return Empath.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Empath.GetInstance() as T;
    }
}

export default Empath;