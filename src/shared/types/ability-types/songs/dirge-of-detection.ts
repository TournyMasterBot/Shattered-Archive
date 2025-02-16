import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class DirgeOfDetection implements IAbility {
    private static instance: DirgeOfDetection;

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
        this.name = "Dirge of Detection";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
Dirge of Detection - When the skald chants this tune, it enables all in 
the skald's group the ability to detect hidden and detect invisible.
`;
        
        if (DirgeOfDetection.instance === undefined) {
            DirgeOfDetection.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DirgeOfDetection {
        if (!DirgeOfDetection.instance) {
            DirgeOfDetection.instance = new DirgeOfDetection();
        }
        return DirgeOfDetection.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DirgeOfDetection.GetInstance() as T;
    }
}

export default DirgeOfDetection;