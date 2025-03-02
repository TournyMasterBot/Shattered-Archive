import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import DivineBlessings from "../groups-spells/DivineBlessings";
import Elemental from "../groups-spells/Elemental";
import Healing from "../groups-spells/Healing";
import Maladictions from "../groups-spells/Maladictions";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import Flail from "@shared/types/ability-types/skills/flail";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import ServerCache from "@shared/cache/server-cache";

export class PriestDefault implements IAbilityGroup {
  static instance: PriestDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.PriestDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Transportation.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...DivineBlessings.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Elemental.GetInstance().abilities,
      Flail.GetInstance(),
      ShieldBlock.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PriestDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PriestDefault.GetInstance() as T;
  }
}

export default PriestDefault;
