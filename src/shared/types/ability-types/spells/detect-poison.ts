import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectPoison implements IAbility {
    private static instance: DetectPoison;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Detect Poison";
        this.helpFile = `
help 'Detect Poison'
'DETECT POISON'
Syntax: cast 'detect poison' <object>

This spell detects the presence of poison in food or drink.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DetectPoison.instance === undefined) {
            DetectPoison.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DetectPoison {
        if (!DetectPoison.instance) {
            DetectPoison.instance = new DetectPoison();
        }
        return DetectPoison.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DetectPoison.GetInstance() as T;
    }
}

export default DetectPoison;