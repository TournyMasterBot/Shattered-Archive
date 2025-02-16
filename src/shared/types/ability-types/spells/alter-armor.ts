import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AlterArmor implements IAbility {
    private static instance: AlterArmor;

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
        this.name = "Alter Armor";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
ALTER ARMOR

Syntax: cast 'alter armor' <target_armor>

Allows a transmuter to change the base type of any armor to cloth so they
may wear it.  

Only fellow members of the Conclave may wear armor altered in this manner. 

Groups containing this spell: Alteration
`;

        if (AlterArmor.instance === undefined) {
            AlterArmor.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AlterArmor {
        if (!AlterArmor.instance) {
            AlterArmor.instance = new AlterArmor();
        }
        return AlterArmor.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AlterArmor.GetInstance() as T;
    }
}

export default AlterArmor;