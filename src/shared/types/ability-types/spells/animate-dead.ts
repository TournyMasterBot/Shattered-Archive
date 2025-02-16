import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class AnimateDead implements IAbility {
    private static instance: AnimateDead;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Animate Dead";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
ANIMATE DEAD

Syntax: cast 'animate dead'

Animate Dead simply raises a corpse from the ground, creating a zombie under
the command of the Necromancer. The corpse loses most of its abilities from
its former life, becoming a mindless zombie which will follow the orders of
the Necromancer until it is dismissed, dispelled, turned, or destroyed.

See also - NECROMANCY NECROMANCER DISMISS
`;

        if (AnimateDead.instance === undefined) {
            AnimateDead.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AnimateDead {
        if (!AnimateDead.instance) {
            AnimateDead.instance = new AnimateDead();
        }
        return AnimateDead.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AnimateDead.GetInstance() as T;
    }
}

export default AnimateDead;