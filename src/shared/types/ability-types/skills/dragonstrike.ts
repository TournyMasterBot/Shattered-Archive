import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Dragonstrike implements IAbility {
    private static instance: Dragonstrike;

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
        this.name = "Dragonstrike";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help dragonstrike
DRAGONSTRIKE
Syntax: dragonstrike <target>
A powerful attack skill that channels the might of dragons.`;

        this.manualDescription = "";

        if (Dragonstrike.instance === undefined) {
            Dragonstrike.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Dragonstrike {
        if (!Dragonstrike.instance) {
            Dragonstrike.instance = new Dragonstrike();
        }
        return Dragonstrike.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Dragonstrike.GetInstance() as T;
    }
}

export default Dragonstrike;