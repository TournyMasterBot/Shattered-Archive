import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Hex implements IAbility {
    private static instance: Hex;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Hex";
        this.helpFile = `
help hex
HEX
HEX

Syntax: cast 'hex'

This spell allows a Shaman to curse the inner soul of a victim, leaving
their life capacity in a lower state. There is a rumor that the Shaman's
hex has different effects depending on the state of the Shaman.

Groups containing this spell: Voodoo

SEE ALSO: SHAMAN, VOODOO
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Hex.instance === undefined) {
            Hex.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Hex {
        if (!Hex.instance) {
            Hex.instance = new Hex();
        }
        return Hex.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Hex.GetInstance() as T;
    }
}

export default Hex;