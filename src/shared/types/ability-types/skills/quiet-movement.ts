import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class QuietMovement implements IAbility {
    private static instance: QuietMovement;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Quiet Movement";
        this.helpFile = 
        `help 'quiet movement'
        QMOVEMENT 'QUIET MOVEMENT'
        Syntax:  qmovement
        This is the rangers way of moving quietly through hills and forests.`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;

        if (QuietMovement.instance === undefined) {
            QuietMovement.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): QuietMovement {
        if (!QuietMovement.instance) {
            QuietMovement.instance = new QuietMovement();
        }
        return QuietMovement.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return QuietMovement.GetInstance() as T;
    }
}

export default QuietMovement;