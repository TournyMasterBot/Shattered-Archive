import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CreateRunestaff from "@shared/types/ability-types/spells/create-runestaff";
import SpellEating from "@shared/types/ability-types/spells/spell-eating";
import Furnace from "@shared/types/ability-types/spells/furnace";
import CliathsHammer from "@shared/types/ability-types/spells/cliaths-hammer";
import Courage from "@shared/types/ability-types/spells/courage";
import Fortitude from "@shared/types/ability-types/spells/fortitude";
import SureStriking from "@shared/types/ability-types/spells/sure-striking";
import IronGrip from "@shared/types/ability-types/spells/iron-grip";
import Damned from "@shared/types/ability-types/spells/damned";
import Breaking from "@shared/types/ability-types/spells/breaking";
import Destruction from "@shared/types/ability-types/spells/destruction";
import CreateRunehammer from "@shared/types/ability-types/spells/create-runehammer";

export class Runesmithing implements IAbilityGroup {
    static instance: Runesmithing;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Runesmithing;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            CreateRunestaff.GetInstance().Get(),
            SpellEating.GetInstance().Get(),
            Furnace.GetInstance().Get(),
            CliathsHammer.GetInstance().Get(),
            Courage.GetInstance().Get(),
            Fortitude.GetInstance().Get(),
            SureStriking.GetInstance().Get(),
            IronGrip.GetInstance().Get(),
            Damned.GetInstance().Get(),
            Breaking.GetInstance().Get(),
            Destruction.GetInstance().Get(),
            CreateRunehammer.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Runesmithing {
        if (!Runesmithing.instance) {
            Runesmithing.instance = new Runesmithing();
        }
        return Runesmithing.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Runesmithing.GetInstance() as T;
    }
}

export default Runesmithing;
