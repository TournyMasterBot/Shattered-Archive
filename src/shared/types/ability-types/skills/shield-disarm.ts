import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ShieldDisarm implements IAbility {
    private static instance: ShieldDisarm;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Shield Disarm";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `SHIELD DISARM

 Syntax: sdisarm <target>

The Shadowknights of Necrucifer have perfected many forms of combat, and may
be considered the masters of mounted warfare.  There are few skills as
telling of this fact as the art of shield disarming.  A mounted Shadowknight
may attempt to use his weapon as a savage cudgel, tearing away their
opponent's shield and leaving them stunned and open to attack.`;

        if (ShieldDisarm.instance === undefined) {
            ShieldDisarm.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): ShieldDisarm {
        if (!ShieldDisarm.instance) {
            ShieldDisarm.instance = new ShieldDisarm();
        }
        return ShieldDisarm.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ShieldDisarm.GetInstance() as T;
    }
}

export default ShieldDisarm;