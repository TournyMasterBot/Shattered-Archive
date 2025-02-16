import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fear implements IAbility {
    private static instance: Fear;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Fear";
        this.helpFile = `FEAR
FEAR

By putting this hex on an opponent, the witch or warlock instills an
incredible and unreasoning panic in them. One affected with the fear spell
will find it very difficult to fight, as the slightest touch sends them
running away, screaming with fright.  

NOTE: After the effects of fear wear off, one must reset the wimpy setting. 

See also - WITCHCRAFT`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Fear.instance === undefined) {
            Fear.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Fear {
        if (!Fear.instance) {
            Fear.instance = new Fear();
        }
        return Fear.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Fear.GetInstance() as T;
    }
}

export default Fear;