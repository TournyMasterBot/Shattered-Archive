import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Spellcraft implements IAbility {
    private static instance: Spellcraft;

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
        this.name = "Spellcraft";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.helpFile = `spellcraft
SPELLCRAFT
An optional skill for the mage and mage reclasses is spellcraft.  Mages who
choose to undertake the skill of spellcraft spend long hours researching the
finer points of spell casting and power control.  The result of these
extensive studies allows a mage to strengthen the power of his casting, most
evident in his damage causing spells.  Another benefit of the spellcraft
skill is that a mage learns the efficient use of mana during his practice of
casting.`;
        this.manualDescription = "More explicitly, spellcraft refunds the mana cost if you fail to cast the spell. Take it.";

        if (Spellcraft.instance === undefined) {
            Spellcraft.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Spellcraft {
        if (!Spellcraft.instance) {
            Spellcraft.instance = new Spellcraft();
        }
        return Spellcraft.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Spellcraft.GetInstance() as T;
    }
}

export default Spellcraft;