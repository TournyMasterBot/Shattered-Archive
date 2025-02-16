import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Beguiling from "../groups-spells/beguiling";
import Combat from "../groups-spells/combat";
import Detection from "../groups-spells/detection";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import GreaterIllusions from "../groups-spells/greater-illusions";
import Illusion from "../groups-spells/illusion";
import Maladictions from "../groups-spells/maladictions";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";
import Astrology from "@shared/types/ability-types/skills/astrology";

export class IllusionistDefault implements IAbilityGroup {
  static instance: IllusionistDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.IllusionistDefault;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      ...GreaterIllusions.GetInstance().Get<GreaterIllusions>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Beguiling.GetInstance().Get<Beguiling>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Illusion.GetInstance().Get<Illusion>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      Astrology.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): IllusionistDefault {
    if (!IllusionistDefault.instance) {
      IllusionistDefault.instance = new IllusionistDefault();
    }
    return IllusionistDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return IllusionistDefault.GetInstance() as T;
  }
}

export default IllusionistDefault;
