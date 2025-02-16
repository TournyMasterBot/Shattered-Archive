import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class HandToHand implements IAbility {
    private static instance: HandToHand;

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
        this.name = "HandToHand";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.helpFile = `help 'Hand to Hand'
'HAND TO HAND'
Hand to hand combat is a rare skill in the lands of Algoron.  Learning
this style of fighting gives the player a weapon even when disarmed --
bare hands. Trained hand to hand experts are far more effective than many
swordsmen. Clerics and warriors are the best at this skill, although
thieves and mages may also learn it.`;

        if (HandToHand.instance === undefined) {
            HandToHand.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): HandToHand {
        if (!HandToHand.instance) {
            HandToHand.instance = new HandToHand();
        }
        return HandToHand.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HandToHand.GetInstance() as T;
    }
}

export default HandToHand;