import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PowerSwing implements IAbility {
    private static instance: PowerSwing;

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
        this.name = "PowerSwing";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help powerswing
POWERSWING
POWERSWING

syntax: powerswing <target>

The most feared talent of the barbarian, while holding a weapon when
injured, they will swing with such devastating force that they have the
ability to stun its target.  Should they wield a weapon in both hands, their
swing can cause great damage to the barbarian's foe, an attack so powerful
that even the largest dragons can be dazed by the hit.

Groups containing this skill: BARBARIAN DEFAULT 
        `;
        this.manualDescription = "Powerswing can be used when you reach 80% hp";

        if (PowerSwing.instance === undefined) {
            PowerSwing.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): PowerSwing {
        if (!PowerSwing.instance) {
            PowerSwing.instance = new PowerSwing();
        }
        return PowerSwing.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PowerSwing.GetInstance() as T;
    }
}

export default PowerSwing;