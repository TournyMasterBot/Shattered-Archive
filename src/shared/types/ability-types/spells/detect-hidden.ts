import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectHidden implements IAbility {
    private static instance: DetectHidden;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Detect Hidden";
        this.helpFile = `
help 'Detect Hidden'
'DETECT HIDDEN'
'DETECT HIDDEN'
Syntax: cast 'detect hidden'
This spell enables the caster to detect hidden creatures.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DetectHidden.instance === undefined) {
            DetectHidden.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DetectHidden {
        if (!DetectHidden.instance) {
            DetectHidden.instance = new DetectHidden();
        }
        return DetectHidden.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DetectHidden.GetInstance() as T;
    }
}

export default DetectHidden;