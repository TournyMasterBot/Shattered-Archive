import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class AcuteVision implements IAbility {
    private static instance: AcuteVision;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Acute Vision";
        this.helpFile =
`help acute
'ACUTE VISION'
ACUTE VISION
Acute vision is a skill that allows those who have it to be able to see 
characters who are hiding, sneaking, camouflaged, or using quiet
movement.  It is a benefit of the training one undergoes while 
becoming certain reclasses and works automatically for those who have it.`;

        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;

        if (AcuteVision.instance === undefined) {
            AcuteVision.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AcuteVision {
        if (!AcuteVision.instance) {
            AcuteVision.instance = new AcuteVision();
        }
        return AcuteVision.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AcuteVision.GetInstance() as T;
    }
}

export default AcuteVision;