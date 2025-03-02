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
import ServerCache from "@shared/cache/server-cache";

export class Runesmithing implements IAbilityGroup {
  static instance: Runesmithing;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Runesmithing;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CreateRunestaff.GetInstance(),
      SpellEating.GetInstance(),
      Furnace.GetInstance(),
      CliathsHammer.GetInstance(),
      Courage.GetInstance(),
      Fortitude.GetInstance(),
      SureStriking.GetInstance(),
      IronGrip.GetInstance(),
      Damned.GetInstance(),
      Breaking.GetInstance(),
      Destruction.GetInstance(),
      CreateRunehammer.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Runesmithing {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Runesmithing.GetInstance() as T;
  }
}

export default Runesmithing;
