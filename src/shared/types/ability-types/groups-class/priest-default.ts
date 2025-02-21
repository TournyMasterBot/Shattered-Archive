import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import DivineBlessings from "../groups-spells/divine-blessings";
import Elemental from "../groups-spells/elemental";
import Healing from "../groups-spells/healing";
import Maladictions from "../groups-spells/maladictions";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";
import Flail from "@shared/types/ability-types/skills/flail";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";

export class PriestDefault implements IAbilityGroup {
  static instance: PriestDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.PriestDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...DivineBlessings.GetInstance().Get<DivineBlessings>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      ...Curative.GetInstance().Get<Curative>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      ...Elemental.GetInstance().Get<Elemental>().abilities,
      Flail.GetInstance().Get(),
      ShieldBlock.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PriestDefault {
    if (!PriestDefault.instance) {
      PriestDefault.instance = new PriestDefault();
    }
    return PriestDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PriestDefault.GetInstance() as T;
  }
}

export default PriestDefault;
