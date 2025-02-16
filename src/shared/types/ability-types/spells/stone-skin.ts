import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class StoneSkin implements IAbility {
    private static instance: StoneSkin;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;
    abilityBuffCommand?: string | undefined;
    abilityBuffVariable?: string | undefined;

    constructor() {
        this.name = "Stone Skin";
        this.helpFile =
`help 'Stone Skin'
SHIELD 'STONE SKIN'
SHIELD 'STONE SKIN'
Syntax: cast shield
Syntax: cast 'stone skin'
These spells protect the caster by decreasing (improving) the caster's armor
class.  SHIELD provides 20 points off armor.  STONE SKIN provides 40 points off
armor.`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.abilityBuffCommand = "c 'stone skin'"

        if (StoneSkin.instance === undefined) {
            StoneSkin.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): StoneSkin {
        if (!StoneSkin.instance) {
            StoneSkin.instance = new StoneSkin();
        }
        return StoneSkin.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return StoneSkin.GetInstance() as T;
    }
}

export default StoneSkin;