import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Brew implements IAbility {
    private static instance: Brew;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Brew";
        this.helpFile = `
BREW

Brew is the trademark skill of the witch, and entails standing
around a bubbling cauldron stirring it until a magical potion
is created. Witches typically store their potions in eggshell-thin
gourds which can be either quaffed or tossed. (see 'toss')
Brewing a potion is not an exact process, and witches are known
to experiment with a wide variety of materials in their cauldrons
in order to try and control the resulting potion. Any materials
within the cauldron are melted during the process, which will only
work within a special cauldron.
        `;

        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.manualDescription = "";

        if (Brew.instance === undefined) {
            Brew.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Brew {
        if (!Brew.instance) {
            Brew.instance = new Brew();
        }
        return Brew.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Brew.GetInstance() as T;
    }
}

export default Brew;