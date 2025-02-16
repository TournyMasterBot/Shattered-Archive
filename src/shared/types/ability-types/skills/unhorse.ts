import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Unhorse implements IAbility {
    private static instance: Unhorse;

    name: string;
    helpFile: string;
    manualDescription: string;
    duration?: number;
    effects?: SkillSpellEffects;
    group?: string;
    alternateKeyword?: string;
    recommendedHelpFileChanges?: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Unhorse";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = "";
        this.manualDescription = "While riding, the crusader uses a polearm to attempt to unseat their opponent."; // Manual description as specified
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Unhorse {
        if (!Unhorse.instance) {
            Unhorse.instance = new Unhorse();
        }
        return Unhorse.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Unhorse.GetInstance() as T;
    }
}

export default Unhorse;