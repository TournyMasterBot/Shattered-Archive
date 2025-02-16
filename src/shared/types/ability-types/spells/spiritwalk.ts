import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Spiritwalk implements IAbility {
    private static instance: Spiritwalk;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Spiritwalk";
        this.helpFile =
`help spiritwalk
spiritwalk
Syntax: c spiritwalk
Syntax: incorporate
By entering a trance, the shaman may elect to walk in the spirit world.
During this time the soul leaves the body to walk alone, leaving the
body behind. Naturally, the empty husk is quite vulnerable while uninhabited.`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Spiritwalk.instance === undefined) {
            Spiritwalk.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Spiritwalk {
        if (!Spiritwalk.instance) {
            Spiritwalk.instance = new Spiritwalk();
        }
        return Spiritwalk.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Spiritwalk.GetInstance() as T;
    }
}

export default Spiritwalk;