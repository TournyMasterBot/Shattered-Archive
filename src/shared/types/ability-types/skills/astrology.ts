import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Astrology implements IAbility {
    private static instance: Astrology;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Astrology";
        this.helpFile =
`help astrology
ASTROLOGY
ASTROLOGY
Syntax: automatic use
     Astrology can be used in conjunction with the 'lunar' or 'look moons'
command to derive more information about the moons. Those who are very
proficient with astrology can discern the phase of moons that are not
visible, predict the rising of a given moon, and even predict solar and
lunar eclipses. High level astrologers can also see the specific game
effects of the moons when using the 'lunar' command.
     Being a purely scholarly discipline, astrology is available only
to mages and clerics. Dragons may eventually learn it.
see also: MOONS PHASES`;

        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;

        if (Astrology.instance === undefined) {
            Astrology.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Astrology {
        if (!Astrology.instance) {
            Astrology.instance = new Astrology();
        }
        return Astrology.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Astrology.GetInstance() as T;
    }
}

export default Astrology;