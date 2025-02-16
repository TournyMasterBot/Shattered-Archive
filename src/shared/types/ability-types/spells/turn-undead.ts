import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class TurnUndead implements IAbility {
    private static instance: TurnUndead;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Turn Undead";
        this.helpFile =
`turn undead
syntax: cast 'turn undead' <target>
Staying in close proximity with the divine powers of Good grants the
Paladin an advantage over the dark forces of Evil.  One such power involves
the ability to turn creatures of the undead from their unholy existence.
Praying to his deity and uttering the words of power granted from the
divine, the Paladin can destroy those creatures who walk with the living and
yet are not.
see also:  PALADIN, KNIGHTHOOD`;
        this.manualDescription = ``;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (TurnUndead.instance === undefined) {
            TurnUndead.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): TurnUndead {
        if (!TurnUndead.instance) {
            TurnUndead.instance = new TurnUndead();
        }
        return TurnUndead.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return TurnUndead.GetInstance() as T;
    }
}

export default TurnUndead;