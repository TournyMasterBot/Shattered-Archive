import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HolyWord implements IAbility {
    private static instance: HolyWord;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Holy Word";
        this.helpFile = `
help 'Holy Word'
'HOLY WORD'
'HOLY WORD'

Syntax: cast 'holy word'

Holy word involves the invocation of the full power of a cleric's god, with
disastrous effects upon enemies, coupled with powerful blessings on allies.
All creatures of like alignment in the room are blessed and filled with
righteous divine wrath, while those of opposite morals (or both good and
evil in the case of neutrality) are struck down by holy (or unholy might)
and cursed.

The cleric suffers greatly from the strain of this spell, being left unable
to move and drained of vitality. Experience loss is no longer associated
with the spell.

See also - BENEDICTIONS`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (HolyWord.instance === undefined) {
            HolyWord.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): HolyWord {
        if (!HolyWord.instance) {
            HolyWord.instance = new HolyWord();
        }
        return HolyWord.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HolyWord.GetInstance() as T;
    }
}

export default HolyWord;